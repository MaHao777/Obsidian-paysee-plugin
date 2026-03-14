import type { BillEntry, MonthlyAggregation } from "./types";

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

export function sortBillsForDisplay(bills: BillEntry[]): BillEntry[] {
    return [...bills].sort((a, b) => {
        const dateDiff = b.date.localeCompare(a.date);
        if (dateDiff !== 0) return dateDiff;
        return b.createdAt.localeCompare(a.createdAt);
    });
}
