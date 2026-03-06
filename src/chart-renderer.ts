import {
    ArcElement,
    BarController,
    BarElement,
    CategoryScale,
    Chart,
    DoughnutController,
    Legend,
    LinearScale,
    Tooltip,
} from "chart.js";
import { getRelativePosition } from "chart.js/helpers";
import { CATEGORY_COLORS, EXTRA_COLORS } from "./constants";

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

type PieSegmentGeometry = {
    startAngle: number;
    endAngle: number;
};

type PieHitGeometry = {
    centerX: number;
    centerY: number;
    innerRadius: number;
    outerRadius: number;
    segments: PieSegmentGeometry[];
};

const pieHoverCleanupMap = new WeakMap<Chart, () => void>();

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

function normalizeAngle(angle: number): number {
    const full = Math.PI * 2;
    let normalized = angle % full;
    if (normalized < 0) normalized += full;
    return normalized;
}

function isAngleWithin(angle: number, start: number, end: number): boolean {
    const a = normalizeAngle(angle);
    const s = normalizeAngle(start);
    const e = normalizeAngle(end);
    if (s <= e) return a >= s && a <= e;
    return a >= s || a <= e;
}

function buildPieHitGeometry(chart: Chart): PieHitGeometry | null {
    const meta = chart.getDatasetMeta(0);
    const arcs = meta.data as ArcElement[];
    const chartArea = chart.chartArea;
    if (arcs.length === 0 || !chartArea) return null;

    const firstArc = arcs[0].getProps(["innerRadius", "outerRadius"], true);
    const centerX = (chartArea.left + chartArea.right) / 2;
    const centerY = (chartArea.top + chartArea.bottom) / 2;

    const segments: PieSegmentGeometry[] = [];
    for (let i = 0; i < arcs.length; i++) {
        const value = Number(chart.data.datasets[0]?.data?.[i] ?? 0);
        if (!Number.isFinite(value) || value <= 0) {
            segments.push({ startAngle: 0, endAngle: 0 });
            continue;
        }

        const angleProps = arcs[i].getProps(["startAngle", "endAngle"], true);
        segments.push({
            startAngle: angleProps.startAngle,
            endAngle: angleProps.endAngle,
        });
    }

    return {
        centerX,
        centerY,
        innerRadius: firstArc.innerRadius,
        outerRadius: firstArc.outerRadius,
        segments,
    };
}

function findSegmentByAngle(geometry: PieHitGeometry, angle: number): number {
    for (let i = 0; i < geometry.segments.length; i++) {
        const seg = geometry.segments[i];
        if (seg.startAngle === seg.endAngle) continue;
        if (isAngleWithin(angle, seg.startAngle, seg.endAngle)) return i;
    }
    return -1;
}

function setPieVisualState(chart: Chart, index: number, hoverOffset: number): void {
    const dataset = chart.data.datasets[0];
    const dataLength = Array.isArray(dataset.data) ? dataset.data.length : 0;
    const offsets = new Array<number>(dataLength).fill(0);
    if (index >= 0 && hoverOffset > 0 && index < offsets.length) {
        offsets[index] = hoverOffset;
    }

    (dataset as { offset?: number[] }).offset = offsets;

    if (chart.tooltip) {
        if (index >= 0) {
            const arc = chart.getDatasetMeta(0).data[index] as ArcElement | undefined;
            const position = arc ? arc.getCenterPoint() : { x: 0, y: 0 };
            chart.tooltip.setActiveElements([{ datasetIndex: 0, index }], position);
        } else {
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        }
    }

    chart.update("none");
}

function findNextPieIndex(chart: Chart, x: number, y: number, activeIndex: number): number {
    const geometry = buildPieHitGeometry(chart);
    if (!geometry) return -1;

    const dx = x - geometry.centerX;
    const dy = y - geometry.centerY;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    const enterInnerPadding = 2;
    const enterOuterPadding = 6;
    const leaveInnerPadding = 10;
    const leaveOuterPadding = 16;

    if (activeIndex < 0) {
        const inEnterRing =
            distance >= geometry.innerRadius - enterInnerPadding &&
            distance <= geometry.outerRadius + enterOuterPadding;
        if (!inEnterRing) return -1;
        return findSegmentByAngle(geometry, angle);
    }

    const inLeaveRing =
        distance >= geometry.innerRadius - leaveInnerPadding &&
        distance <= geometry.outerRadius + leaveOuterPadding;
    if (!inLeaveRing) return -1;

    const activeSeg = geometry.segments[activeIndex];
    const lockEpsilon = Math.PI / 72; // ~2.5 degrees
    if (
        activeSeg &&
        isAngleWithin(angle, activeSeg.startAngle - lockEpsilon, activeSeg.endAngle + lockEpsilon)
    ) {
        return activeIndex;
    }

    const candidate = findSegmentByAngle(geometry, angle);
    return candidate >= 0 ? candidate : activeIndex;
}

function attachStablePieHover(chart: Chart, hoverOffset: number): void {
    const canvas = chart.canvas;
    let activeIndex = -1;
    let pendingIndex: number | null = null;
    let pendingSince = 0;

    const SWITCH_STABLE_MS = 65;
    const LEAVE_STABLE_MS = 90;

    const commitIndex = (nextIndex: number): void => {
        if (nextIndex === activeIndex) return;
        activeIndex = nextIndex;
        pendingIndex = null;
        pendingSince = 0;
        setPieVisualState(chart, activeIndex, hoverOffset);
    };

    const onMove = (event: MouseEvent): void => {
        const point = getRelativePosition(event, chart);
        const nextIndex = findNextPieIndex(chart, point.x, point.y, activeIndex);
        if (nextIndex === activeIndex) {
            pendingIndex = null;
            pendingSince = 0;
            return;
        }

        const now = performance.now();
        if (pendingIndex !== nextIndex) {
            pendingIndex = nextIndex;
            pendingSince = now;
            return;
        }

        const requiredStableMs = nextIndex >= 0 ? SWITCH_STABLE_MS : LEAVE_STABLE_MS;
        if (now - pendingSince < requiredStableMs) return;

        commitIndex(nextIndex);
    };

    const onLeave = (): void => {
        if (activeIndex < 0) return;
        commitIndex(-1);
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    pieHoverCleanupMap.set(chart, () => {
        canvas.removeEventListener("mousemove", onMove);
        canvas.removeEventListener("mouseleave", onLeave);
    });
}

export function renderPieChart(
    container: HTMLElement,
    data: Map<string, number>,
    currency: string
): Chart | null {
    if (data.size === 0) return null;

    const canvas = container.createEl("canvas");
    canvas.width = 240;
    canvas.height = 240;

    const labels = Array.from(data.keys());
    const values = Array.from(data.values());
    const colors = labels.map((label, i) => getCategoryColor(label, i));
    const themeColors = getChartThemeColors();

    // Keep slight expansion on hover, but avoid full-circle single-slice offset.
    const hoverOffset = labels.length > 1 ? 6 : 0;

    const legend = container.createDiv("paysee-pie-legend");
    labels.forEach((label, index) => {
        const item = legend.createDiv("paysee-pie-legend-item");
        const swatch = item.createSpan("paysee-pie-legend-swatch");
        swatch.style.backgroundColor = colors[index];
        item.createSpan({
            cls: "paysee-pie-legend-label",
            text: label,
        });
    });

    const chart = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [
                {
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: themeColors.backgroundPrimary,
                    // Reserve max offset in layout while controlling visible offset manually.
                    hoverOffset,
                    offset: values.map(() => 0),
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            // Disable Chart.js internal hover; use deterministic manual state machine.
            events: [],
            layout: {
                padding: 8,
            },
            transitions: {
                active: {
                    animation: {
                        duration: 0,
                    },
                },
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    titleColor: themeColors.textNormal,
                    bodyColor: themeColors.textNormal,
                    borderColor: themeColors.border,
                    borderWidth: 1,
                    callbacks: {
                        label(ctx) {
                            const val = Number(ctx.parsed);
                            const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
                            return ` ${ctx.label}: ${currency}${val.toFixed(2)} (${pct}%)`;
                        },
                    },
                },
            },
        },
    });

    attachStablePieHover(chart, hoverOffset);
    return chart;
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
    if (!chart) return;

    const cleanup = pieHoverCleanupMap.get(chart);
    if (cleanup) {
        cleanup();
        pieHoverCleanupMap.delete(chart);
    }

    chart.destroy();
}
