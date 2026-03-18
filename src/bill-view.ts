import { ItemView, Menu, WorkspaceLeaf } from "obsidian";
import type { Chart } from "chart.js";
import { VIEW_TYPE_PAYSEE } from "./constants";
import type { BillEntry, BillSortMode, BillType, IBillStorage, PaySeeSettings } from "./types";
import {
    getAmountBucketForAmount,
    getAmountBuckets,
    getMonthlyAggregation,
    filterBills,
    normalizeAmountThresholds,
    sortBillsForDisplay,
} from "./bill-parser";
import { renderPieChart, renderBarChart, destroyChart } from "./chart-renderer";
import { BillModal } from "./bill-modal";

const ALL_FILTER = "all";

type SelectOption = {
    value: string;
    label: string;
};

export class PaySeeView extends ItemView {
    private settings: PaySeeSettings;
    private readonly storage: IBillStorage;
    private currentYear: number;
    private currentMonth: number;
    private pieChart: Chart | null = null;
    private barChart: Chart | null = null;
    private typeFilter: BillType | "all" = ALL_FILTER;
    private categoryFilter = ALL_FILTER;
    private amountBucketFilter = ALL_FILTER;
    private sortMode: BillSortMode = "date-desc";

    constructor(leaf: WorkspaceLeaf, settings: PaySeeSettings, storage: IBillStorage) {
        super(leaf);
        this.settings = settings;
        this.storage = storage;
        const now = moment();
        this.currentYear = now.year();
        this.currentMonth = now.month() + 1;
    }

    getViewType(): string {
        return VIEW_TYPE_PAYSEE;
    }

    getDisplayText(): string {
        return "PaySee Bills";
    }

    getIcon(): string {
        return "wallet";
    }

    async onOpen(): Promise<void> {
        await this.refresh();
    }

    async onClose(): Promise<void> {
        this.destroyCharts();
    }

    updateSettings(settings: PaySeeSettings): void {
        this.settings = settings;
    }

    async refresh(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("paysee-view-container");

        this.destroyCharts();

        const nav = container.createDiv("paysee-month-nav");
        const prevBtn = nav.createEl("button", { text: "<", cls: "paysee-nav-btn" });
        nav.createEl("span", {
            text: `${this.currentYear}-${String(this.currentMonth).padStart(2, "0")}`,
            cls: "paysee-month-label",
        });
        const nextBtn = nav.createEl("button", { text: ">", cls: "paysee-nav-btn" });

        prevBtn.addEventListener("click", () => {
            this.currentMonth -= 1;
            if (this.currentMonth < 1) {
                this.currentMonth = 12;
                this.currentYear -= 1;
            }
            void this.refresh();
        });

        nextBtn.addEventListener("click", () => {
            this.currentMonth += 1;
            if (this.currentMonth > 12) {
                this.currentMonth = 1;
                this.currentYear += 1;
            }
            void this.refresh();
        });

        const monthBills = await this.storage.listBillsByMonth(this.currentYear, this.currentMonth);
        const thresholds = normalizeAmountThresholds(this.settings.amountThresholds);
        const amountBuckets = getAmountBuckets(thresholds);
        const categoryOptions = this.getMonthCategories(monthBills);
        this.normalizeActiveFilters(categoryOptions, amountBuckets.map((bucket) => bucket.id));

        this.renderFilterBar(
            container,
            categoryOptions,
            amountBuckets.map((bucket) => ({ value: bucket.id, label: bucket.label }))
        );

        const filteredBills = filterBills(
            monthBills,
            {
                type: this.typeFilter,
                category: this.categoryFilter,
                amountBucketId: this.amountBucketFilter,
            },
            thresholds
        );
        const sortedBills = sortBillsForDisplay(filteredBills, this.sortMode);
        const agg = getMonthlyAggregation(sortedBills);
        const currency = this.settings.currency;

        const summary = container.createDiv("paysee-summary");

        const incomeCard = summary.createDiv("paysee-card paysee-income-card");
        incomeCard.createEl("div", { text: "Income", cls: "paysee-card-label" });
        incomeCard.createEl("div", {
            text: `${currency}${agg.totalIncome.toFixed(2)}`,
            cls: "paysee-card-value",
        });

        const expenseCard = summary.createDiv("paysee-card paysee-expense-card");
        expenseCard.createEl("div", { text: "Expense", cls: "paysee-card-label" });
        expenseCard.createEl("div", {
            text: `${currency}${agg.totalExpense.toFixed(2)}`,
            cls: "paysee-card-value",
        });

        const balanceCard = summary.createDiv("paysee-card paysee-balance-card");
        balanceCard.createEl("div", { text: "Balance", cls: "paysee-card-label" });
        balanceCard.createEl("div", {
            text: `${currency}${agg.balance.toFixed(2)}`,
            cls: "paysee-card-value",
        });

        if (agg.byCategory.size > 0) {
            const pieSection = container.createDiv("paysee-chart-section");
            pieSection.createEl("h4", { text: "Expense by Category" });
            const pieContainer = pieSection.createDiv("paysee-chart-container");
            this.pieChart = renderPieChart(pieContainer, agg.byCategory, currency);
        }

        if (agg.byDay.size > 0) {
            const barSection = container.createDiv("paysee-chart-section");
            barSection.createEl("h4", { text: "Daily Cashflow" });
            const barContainer = barSection.createDiv("paysee-chart-container");
            this.barChart = renderBarChart(barContainer, agg.byDay, currency);
        }

        const listSection = container.createDiv("paysee-list-section");
        listSection.createEl("h4", { text: "Bills" });

        if (monthBills.length === 0) {
            listSection.createEl("p", {
                text: "No bills for this month",
                cls: "paysee-empty",
            });
            return;
        }

        if (sortedBills.length === 0) {
            listSection.createEl("p", {
                text: "No bills match the current filters",
                cls: "paysee-empty",
            });
            return;
        }

        const list = listSection.createDiv("paysee-bill-list");
        for (const bill of sortedBills) {
            const item = list.createDiv("paysee-bill-item");
            const isExpense = bill.type === "expense";
            const bucket = getAmountBucketForAmount(bill.amount, thresholds);

            const left = item.createDiv("paysee-bill-left");
            const meta = left.createDiv("paysee-bill-meta");
            meta.createEl("span", { text: bill.category, cls: "paysee-bill-category" });
            meta.createEl("span", {
                text: bucket.label,
                cls: "paysee-bill-bucket-badge",
            });

            left.createEl("span", {
                text: bill.date,
                cls: "paysee-bill-date",
            });

            if (bill.note) {
                left.createEl("span", {
                    text: bill.note,
                    cls: "paysee-bill-note",
                });
            }

            const right = item.createDiv("paysee-bill-right");
            right.createEl("span", {
                text: `${isExpense ? "-" : "+"}${currency}${bill.amount.toFixed(2)}`,
                cls: isExpense ? "paysee-amount-expense" : "paysee-amount-income",
            });

            item.addEventListener("click", () => {
                new BillModal(
                    this.app,
                    this.settings,
                    this.storage,
                    async () => {
                        await this.refresh();
                    },
                    bill
                ).open();
            });
        }
    }

    private getMonthCategories(bills: BillEntry[]): string[] {
        const categories: string[] = [];
        const seen = new Set<string>();

        for (const category of this.settings.categories) {
            if (!bills.some((bill) => bill.category === category) || seen.has(category)) {
                continue;
            }

            seen.add(category);
            categories.push(category);
        }

        for (const bill of bills) {
            if (seen.has(bill.category)) {
                continue;
            }

            seen.add(bill.category);
            categories.push(bill.category);
        }

        return categories;
    }

    private normalizeActiveFilters(categories: string[], bucketIds: string[]): void {
        if (this.categoryFilter !== ALL_FILTER && !categories.includes(this.categoryFilter)) {
            this.categoryFilter = ALL_FILTER;
        }

        if (
            this.amountBucketFilter !== ALL_FILTER &&
            !bucketIds.includes(this.amountBucketFilter)
        ) {
            this.amountBucketFilter = ALL_FILTER;
        }
    }

    private renderFilterBar(
        container: HTMLElement,
        categories: string[],
        amountBuckets: SelectOption[]
    ): void {
        const filterBar = container.createDiv("paysee-filter-bar");

        this.renderSelect(filterBar, "Type", [
            { value: ALL_FILTER, label: "All Types" },
            { value: "income", label: "Income" },
            { value: "expense", label: "Expense" },
        ], this.typeFilter, (value) => {
            this.typeFilter = value as BillType | "all";
        });

        this.renderSelect(
            filterBar,
            "Category",
            [
                { value: ALL_FILTER, label: "All Categories" },
                ...categories.map((category) => ({ value: category, label: category })),
            ],
            this.categoryFilter,
            (value) => {
                this.categoryFilter = value;
            }
        );

        this.renderSelect(
            filterBar,
            "Amount Bucket",
            [{ value: ALL_FILTER, label: "All Amount Buckets" }, ...amountBuckets],
            this.amountBucketFilter,
            (value) => {
                this.amountBucketFilter = value;
            }
        );

        this.renderSelect(
            filterBar,
            "Sort",
            [
                { value: "date-desc", label: "Date Desc" },
                { value: "amount-desc", label: "Amount Desc" },
            ],
            this.sortMode,
            (value) => {
                this.sortMode = value as BillSortMode;
            }
        );
    }

    private renderSelect(
        container: HTMLElement,
        label: string,
        options: SelectOption[],
        selectedValue: string,
        onChange: (value: string) => void
    ): void {
        const group = container.createDiv("paysee-filter-group");
        group.createEl("label", { text: label, cls: "paysee-filter-label" });

        const selectedOption =
            options.find((option) => option.value === selectedValue) || options[0];
        const trigger = group.createEl("button", {
            cls: "paysee-filter-trigger",
            attr: {
                type: "button",
                "aria-label": `${label}: ${selectedOption.label}`,
            },
        });
        trigger.createSpan({
            text: selectedOption.label,
            cls: "paysee-filter-trigger-text",
        });
        trigger.createSpan({
            text: "▼",
            cls: "paysee-filter-trigger-icon",
        });

        trigger.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const menu = new Menu();
            menu.setUseNativeMenu(false);

            for (const option of options) {
                menu.addItem((item) =>
                    item
                        .setTitle(option.label)
                        .setChecked(option.value === selectedValue)
                        .onClick(() => {
                            if (option.value === selectedValue) {
                                return;
                            }

                            onChange(option.value);
                            void this.refresh();
                        })
                );
            }

            menu.showAtMouseEvent(event);
        });
    }

    private destroyCharts(): void {
        destroyChart(this.pieChart);
        destroyChart(this.barChart);
        this.pieChart = null;
        this.barChart = null;
    }
}
