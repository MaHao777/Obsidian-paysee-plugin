import { ItemView, WorkspaceLeaf } from "obsidian";
import type { Chart } from "chart.js";
import { VIEW_TYPE_PAYSEE } from "./constants";
import type { IBillStorage, PaySeeSettings } from "./types";
import { getMonthlyAggregation, sortBillsForDisplay } from "./bill-parser";
import { renderPieChart, renderBarChart, destroyChart } from "./chart-renderer";
import { BillModal } from "./bill-modal";

export class PaySeeView extends ItemView {
    private settings: PaySeeSettings;
    private readonly storage: IBillStorage;
    private currentYear: number;
    private currentMonth: number;
    private pieChart: Chart | null = null;
    private barChart: Chart | null = null;

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
        const sortedBills = sortBillsForDisplay(monthBills);
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

        if (sortedBills.length === 0) {
            listSection.createEl("p", {
                text: "No bills for this month",
                cls: "paysee-empty",
            });
            return;
        }

        const list = listSection.createDiv("paysee-bill-list");
        for (const bill of sortedBills) {
            const item = list.createDiv("paysee-bill-item");
            const isExpense = bill.type === "expense";

            const left = item.createDiv("paysee-bill-left");
            left.createEl("span", { text: bill.category, cls: "paysee-bill-category" });
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

    private destroyCharts(): void {
        destroyChart(this.pieChart);
        destroyChart(this.barChart);
        this.pieChart = null;
        this.barChart = null;
    }
}
