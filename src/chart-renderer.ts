import { Chart, ArcElement, BarElement, BarController, DoughnutController, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import { CATEGORY_COLORS, EXTRA_COLORS } from "./constants";

// 注册使用到的 chart.js 组件
Chart.register(ArcElement, BarElement, BarController, DoughnutController, CategoryScale, LinearScale, Tooltip, Legend);

/** 获取分类颜色，未知分类走备用色板 */
function getCategoryColor(category: string, index: number): string {
    return CATEGORY_COLORS[category] || EXTRA_COLORS[index % EXTRA_COLORS.length];
}

/** 环形图：按分类展示支出占比 */
export function renderPieChart(
    container: HTMLElement,
    data: Map<string, number>,
    currency: string
): Chart | null {
    if (data.size === 0) return null;

    const canvas = container.createEl("canvas");
    canvas.width = 300;
    canvas.height = 300;

    const labels = Array.from(data.keys());
    const values = Array.from(data.values());
    const colors = labels.map((label, i) => getCategoryColor(label, i));

    return new Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [
                {
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: "var(--background-primary)",
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: "var(--text-normal)",
                        padding: 12,
                        font: { size: 12 },
                    },
                },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            const val = ctx.parsed;
                            const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                            const pct = ((val / total) * 100).toFixed(1);
                            return ` ${ctx.label}: ${currency}${val.toFixed(2)} (${pct}%)`;
                        },
                    },
                },
            },
        },
    });
}

/** 柱状图：按日展示收支对比 */
export function renderBarChart(
    container: HTMLElement,
    data: Map<string, { income: number; expense: number }>,
    currency: string
): Chart | null {
    if (data.size === 0) return null;

    const canvas = container.createEl("canvas");
    canvas.width = 300;
    canvas.height = 200;

    // 按日期排序
    const sortedEntries = Array.from(data.entries()).sort(([a], [b]) =>
        a.localeCompare(b)
    );
    const labels = sortedEntries.map(([d]) => {
        // 只显示日部分 MM-DD
        const parts = d.split("-");
        return parts.length >= 3 ? `${parts[1]}-${parts[2]}` : d;
    });
    const incomeData = sortedEntries.map(([, v]) => v.income);
    const expenseData = sortedEntries.map(([, v]) => v.expense);

    return new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "收入",
                    data: incomeData,
                    backgroundColor: "rgba(46, 204, 113, 0.7)",
                    borderColor: "rgba(46, 204, 113, 1)",
                    borderWidth: 1,
                },
                {
                    label: "支出",
                    data: expenseData,
                    backgroundColor: "rgba(231, 76, 60, 0.7)",
                    borderColor: "rgba(231, 76, 60, 1)",
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                x: {
                    ticks: { color: "var(--text-muted)" },
                    grid: { color: "var(--background-modifier-border)" },
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "var(--text-muted)",
                        callback(value) {
                            return currency + value;
                        },
                    },
                    grid: { color: "var(--background-modifier-border)" },
                },
            },
            plugins: {
                legend: {
                    labels: {
                        color: "var(--text-normal)",
                        font: { size: 12 },
                    },
                },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            return ` ${ctx.dataset.label}: ${currency}${(ctx.parsed.y ?? 0).toFixed(2)}`;
                        },
                    },
                },
            },
        },
    });
}

/** 销毁 chart 实例 */
export function destroyChart(chart: Chart | null): void {
    if (chart) {
        chart.destroy();
    }
}
