import { DEFAULT_AMOUNT_THRESHOLDS } from "./constants";
import type { BillEntry, BillSortMode, BillType, MonthlyAggregation } from "./types";

export interface AmountBucket {
    id: string;
    min: number;
    max: number | null;
    label: string;
}

export interface BillFilterCriteria {
    type: BillType | "all";
    category: string | "all";
    amountBucketId: string | "all";
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

function sanitizeThresholds(values: number[] | null | undefined): number[] {
    if (!Array.isArray(values)) {
        return [];
    }

    return Array.from(
        new Set(
            values
                .map((value) => roundMoney(Number(value)))
                .filter((value) => Number.isFinite(value) && value > 0)
        )
    ).sort((a, b) => a - b);
}

function formatAmountValue(value: number): string {
    if (Number.isInteger(value)) {
        return String(value);
    }

    return value.toFixed(2).replace(/\.?0+$/, "");
}

function createAmountBucketId(min: number, max: number | null): string {
    return max === null ? `gte:${min}` : `range:${min}:${max}`;
}

export function normalizeAmountThresholds(
    values: number[] | null | undefined,
    fallback: number[] = DEFAULT_AMOUNT_THRESHOLDS
): number[] {
    const normalized = sanitizeThresholds(values);
    if (normalized.length > 0) {
        return normalized;
    }

    const fallbackNormalized = sanitizeThresholds(fallback);
    if (fallbackNormalized.length > 0) {
        return fallbackNormalized;
    }

    return [...DEFAULT_AMOUNT_THRESHOLDS];
}

export function getAmountBuckets(thresholds: number[]): AmountBucket[] {
    const normalized = normalizeAmountThresholds(thresholds);
    const starts = [0, ...normalized];

    return starts.map((min, index) => {
        const max = index + 1 < starts.length ? starts[index + 1] : null;
        return {
            id: createAmountBucketId(min, max),
            min,
            max,
            label:
                max === null
                    ? `${formatAmountValue(min)}+`
                    : `${formatAmountValue(min)}-<${formatAmountValue(max)}`,
        };
    });
}

export function getAmountBucketForAmount(amount: number, thresholds: number[]): AmountBucket {
    const buckets = getAmountBuckets(thresholds);
    const matched = buckets.find(
        (bucket) => amount >= bucket.min && (bucket.max === null || amount < bucket.max)
    );

    return matched || buckets[buckets.length - 1];
}

export function filterBills(
    bills: BillEntry[],
    criteria: BillFilterCriteria,
    thresholds: number[]
): BillEntry[] {
    const normalizedThresholds = normalizeAmountThresholds(thresholds);

    return bills.filter((bill) => {
        if (criteria.type !== "all" && bill.type !== criteria.type) {
            return false;
        }

        if (criteria.category !== "all" && bill.category !== criteria.category) {
            return false;
        }

        if (criteria.amountBucketId !== "all") {
            const bucket = getAmountBucketForAmount(bill.amount, normalizedThresholds);
            if (bucket.id !== criteria.amountBucketId) {
                return false;
            }
        }

        return true;
    });
}

export function getMonthlyAggregation(bills: BillEntry[]): MonthlyAggregation {
    let totalIncome = 0;
    let totalExpense = 0;
    const byCategory = new Map<string, number>();
    const byDay = new Map<string, { income: number; expense: number }>();

    for (const bill of bills) {
        if (bill.type === "income") {
            totalIncome += bill.amount;
        } else {
            totalExpense += bill.amount;
        }

        if (bill.type === "expense") {
            byCategory.set(
                bill.category,
                (byCategory.get(bill.category) || 0) + bill.amount
            );
        }

        const day = bill.date;
        const dayData = byDay.get(day) || { income: 0, expense: 0 };
        if (bill.type === "income") {
            dayData.income += bill.amount;
        } else {
            dayData.expense += bill.amount;
        }
        byDay.set(day, dayData);
    }

    return {
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        byCategory,
        byDay,
    };
}

export function sortBillsForDisplay(
    bills: BillEntry[],
    mode: BillSortMode = "date-desc"
): BillEntry[] {
    return [...bills].sort((a, b) => {
        if (mode === "amount-desc") {
            const amountDiff = b.amount - a.amount;
            if (amountDiff !== 0) {
                return amountDiff;
            }
        }

        const dateDiff = b.date.localeCompare(a.date);
        if (dateDiff !== 0) {
            return dateDiff;
        }

        return b.createdAt.localeCompare(a.createdAt);
    });
}
