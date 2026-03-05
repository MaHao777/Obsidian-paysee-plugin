import {
    Chart,
    ArcElement,
    BarElement,
    BarController,
    DoughnutController,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
} from "chart.js";
import { CATEGORY_COLORS, EXTRA_COLORS } from "./constants";

// Register the Chart.js components used by this plugin.
Chart.register(
    ArcElement,
    BarElement,
    BarController,
    DoughnutController,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend
);

type ChartThemeColors = {
    textNormal: string;
    textMuted: string;
    border: string;
    backgroundPrimary: string;
    income: string;
    expense: string;
};

// Chart.js canvas rendering cannot resolve CSS var(...) directly.
function readCssVar(name: string, fallback: string): string {
    if (typeof window === "undefined") return fallback;
    const value = getComputedStyle(document.body).getPropertyValue(name).trim();
    return value || fallback;
}

function getChartThemeColors(): ChartThemeColors {
    return {
        textNormal: readCssVar("--text-normal", "#222222"),
        textMuted: readCssVar("--text-muted", "#666666"),
        border: readCssVar("--background-modifier-border", "rgba(0, 0, 0, 0.15)"),
        backgroundPrimary: readCssVar("--background-primary", "#ffffff"),
        income: readCssVar("--color-green", "#2ecc71"),
        expense: readCssVar("--color-red", "#e74c3c"),
    };
}

function getCategoryColor(category: string, index: number): string {
    return CATEGORY_COLORS[category] || EXTRA_COLORS[index % EXTRA_COLORS.length];
}

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
    const themeColors = getChartThemeColors();
    // Full-circle single-slice doughnut can jitter when hover offset is applied.
    const hoverOffset = labels.length > 1 ? 6 : 0;

    return new Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [
                {
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: themeColors.backgroundPrimary,
                    hoverOffset,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: "nearest",
                intersect: true,
            },
            // Keep room to prevent hover grow from forcing relayout.
            layout: {
                padding: 6,
            },
            // Disable active-state tweening to avoid subtle hover jitter.
            transitions: {
                active: {
                    animation: {
                        duration: 0,
                    },
                },
            },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: themeColors.textNormal,
                        padding: 12,
                        font: { size: 12 },
                    },
                },
                tooltip: {
                    titleColor: themeColors.textNormal,
                    bodyColor: themeColors.textNormal,
                    borderColor: themeColors.border,
                    borderWidth: 1,
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

export function renderBarChart(
    container: HTMLElement,
    data: Map<string, { income: number; expense: number }>,
    currency: string
): Chart | null {
    if (data.size === 0) return null;

    const canvas = container.createEl("canvas");
    canvas.width = 300;
    canvas.height = 200;

    const sortedEntries = Array.from(data.entries()).sort(([a], [b]) => a.localeCompare(b));
    const labels = sortedEntries.map(([d]) => {
        const parts = d.split("-");
        return parts.length >= 3 ? `${parts[1]}-${parts[2]}` : d;
    });
    const incomeData = sortedEntries.map(([, v]) => v.income);
    const expenseData = sortedEntries.map(([, v]) => v.expense);
    const themeColors = getChartThemeColors();

    return new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "\u6536\u5165",
                    data: incomeData,
                    backgroundColor: themeColors.income,
                    borderColor: themeColors.income,
                    borderWidth: 1,
                },
                {
                    label: "\u652f\u51fa",
                    data: expenseData,
                    backgroundColor: themeColors.expense,
                    borderColor: themeColors.expense,
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                x: {
                    ticks: { color: themeColors.textMuted },
                    grid: { color: themeColors.border },
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: themeColors.textMuted,
                        callback(value) {
                            return currency + value;
                        },
                    },
                    grid: { color: themeColors.border },
                },
            },
            plugins: {
                legend: {
                    labels: {
                        color: themeColors.textNormal,
                        font: { size: 12 },
                    },
                },
                tooltip: {
                    titleColor: themeColors.textNormal,
                    bodyColor: themeColors.textNormal,
                    borderColor: themeColors.border,
                    borderWidth: 1,
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

export function destroyChart(chart: Chart | null): void {
    if (chart) {
        chart.destroy();
    }
}
