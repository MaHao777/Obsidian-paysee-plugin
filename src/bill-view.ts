import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import type { Chart } from "chart.js";
import { VIEW_TYPE_PAYSEE } from "./constants";
import type { BillEntry, PaySeeSettings } from "./types";
import { getAllBills, getBillsByMonth, getMonthlyAggregation } from "./bill-parser";
import { renderPieChart, renderBarChart, destroyChart } from "./chart-renderer";

export class PaySeeView extends ItemView {
    private settings: PaySeeSettings;
    private currentYear: number;
    private currentMonth: number;
    private pieChart: Chart | null = null;
    private barChart: Chart | null = null;

    constructor(leaf: WorkspaceLeaf, settings: PaySeeSettings) {
        super(leaf);
        this.settings = settings;
        const now = moment();
        this.currentYear = now.year();
        this.currentMonth = now.month() + 1; // moment 月份 0-indexed
    }

    getViewType(): string {
        return VIEW_TYPE_PAYSEE;
    }

    getDisplayText(): string {
        return "PaySee 账单";
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

    /** 更新设置引用然后刷新面板 */
    updateSettings(settings: PaySeeSettings): void {
        this.settings = settings;
    }

    /** 完全重新渲染面板 */
    async refresh(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("paysee-view-container");

        this.destroyCharts();

        // ── 顶部月份选择器 ──
        const nav = container.createDiv("paysee-month-nav");
        const prevBtn = nav.createEl("button", { text: "◀", cls: "paysee-nav-btn" });
        const monthLabel = nav.createEl("span", {
            text: `${this.currentYear}年${String(this.currentMonth).padStart(2, "0")}月`,
            cls: "paysee-month-label",
        });
        const nextBtn = nav.createEl("button", { text: "▶", cls: "paysee-nav-btn" });

        prevBtn.addEventListener("click", () => {
            this.currentMonth--;
            if (this.currentMonth < 1) {
                this.currentMonth = 12;
                this.currentYear--;
            }
            this.refresh();
        });
        nextBtn.addEventListener("click", () => {
            this.currentMonth++;
            if (this.currentMonth > 12) {
                this.currentMonth = 1;
                this.currentYear++;
            }
            this.refresh();
        });

        // ── 加载数据 ──
        const allBills = await getAllBills(this.app, this.settings.billFolder);
        const monthBills = getBillsByMonth(allBills, this.currentYear, this.currentMonth);
        const agg = getMonthlyAggregation(monthBills);

        const cur = this.settings.currency;

        // ── 统计摘要卡片 ──
        const summary = container.createDiv("paysee-summary");

        const incomeCard = summary.createDiv("paysee-card paysee-income-card");
        incomeCard.createEl("div", { text: "收入", cls: "paysee-card-label" });
        incomeCard.createEl("div", {
            text: `${cur}${agg.totalIncome.toFixed(2)}`,
            cls: "paysee-card-value",
        });

        const expenseCard = summary.createDiv("paysee-card paysee-expense-card");
        expenseCard.createEl("div", { text: "支出", cls: "paysee-card-label" });
        expenseCard.createEl("div", {
            text: `${cur}${agg.totalExpense.toFixed(2)}`,
            cls: "paysee-card-value",
        });

        const balanceCard = summary.createDiv("paysee-card paysee-balance-card");
        balanceCard.createEl("div", { text: "结余", cls: "paysee-card-label" });
        balanceCard.createEl("div", {
            text: `${cur}${agg.balance.toFixed(2)}`,
            cls: "paysee-card-value",
        });

        // ── 饼图 ──
        if (agg.byCategory.size > 0) {
            const pieSection = container.createDiv("paysee-chart-section");
            pieSection.createEl("h4", { text: "支出分类" });
            const pieContainer = pieSection.createDiv("paysee-chart-container");
            this.pieChart = renderPieChart(pieContainer, agg.byCategory, cur);
        }

        // ── 柱状图 ──
        if (agg.byDay.size > 0) {
            const barSection = container.createDiv("paysee-chart-section");
            barSection.createEl("h4", { text: "每日收支" });
            const barContainer = barSection.createDiv("paysee-chart-container");
            this.barChart = renderBarChart(barContainer, agg.byDay, cur);
        }

        // ── 账单列表 ──
        const listSection = container.createDiv("paysee-list-section");
        listSection.createEl("h4", { text: "账单明细" });

        if (monthBills.length === 0) {
            listSection.createEl("p", {
                text: "本月暂无账单记录",
                cls: "paysee-empty",
            });
        } else {
            // 按日期倒序
            const sorted = [...monthBills].sort((a, b) => b.date.localeCompare(a.date));
            const list = listSection.createDiv("paysee-bill-list");

            for (const bill of sorted) {
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
                    text: `${isExpense ? "-" : "+"}${cur}${bill.amount.toFixed(2)}`,
                    cls: isExpense ? "paysee-amount-expense" : "paysee-amount-income",
                });

                // 点击跳转到对应笔记
                item.addEventListener("click", () => {
                    const file = this.app.vault.getAbstractFileByPath(bill.filePath);
                    if (file instanceof TFile) {
                        this.app.workspace.getLeaf(false).openFile(file);
                    }
                });
            }
        }
    }

    private destroyCharts(): void {
        destroyChart(this.pieChart);
        destroyChart(this.barChart);
        this.pieChart = null;
        this.barChart = null;
    }
}
