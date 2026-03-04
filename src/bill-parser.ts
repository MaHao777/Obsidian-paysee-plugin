import { App, TFile, TFolder } from "obsidian";
import type { BillEntry, MonthlyAggregation } from "./types";

/**
 * 从 vault 指定目录中扫描所有 Markdown 文件，解析 frontmatter 获取账单数据。
 */
export async function getAllBills(app: App, folder: string): Promise<BillEntry[]> {
    const bills: BillEntry[] = [];
    const abstractFile = app.vault.getAbstractFileByPath(folder);
    if (!abstractFile || !(abstractFile instanceof TFolder)) {
        return bills;
    }

    const files = getAllMarkdownFiles(abstractFile);

    for (const file of files) {
        const entry = parseBillFromFile(app, file);
        if (entry) {
            bills.push(entry);
        }
    }

    return bills;
}

/** 递归获取文件夹下所有 .md 文件 */
function getAllMarkdownFiles(folder: TFolder): TFile[] {
    const files: TFile[] = [];
    for (const child of folder.children) {
        if (child instanceof TFile && child.extension === "md") {
            files.push(child);
        } else if (child instanceof TFolder) {
            files.push(...getAllMarkdownFiles(child));
        }
    }
    return files;
}

/** 从单个文件的 frontmatter 解析账单条目 */
function parseBillFromFile(app: App, file: TFile): BillEntry | null {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache?.frontmatter) return null;

    const fm = cache.frontmatter;

    const date = fm["date"];
    const amount = parseFloat(fm["amount"]);
    const category = fm["category"];
    const type = fm["type"];

    // 验证必须字段
    if (!date || isNaN(amount) || !category || !type) return null;
    if (type !== "income" && type !== "expense") return null;

    // 备注取正文内容（frontmatter 之后的部分）
    // 如果 frontmatter 中有 note 字段也可以用
    const note = fm["note"] || "";

    return {
        date: String(date),
        amount: Math.abs(amount),
        category: String(category),
        note: String(note),
        type,
        filePath: file.path,
    };
}

/** 按月筛选账单 */
export function getBillsByMonth(
    bills: BillEntry[],
    year: number,
    month: number
): BillEntry[] {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    return bills.filter((b) => b.date.startsWith(prefix));
}

/** 获取月度汇总数据 */
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

        // 按分类（仅支出）
        if (bill.type === "expense") {
            byCategory.set(
                bill.category,
                (byCategory.get(bill.category) || 0) + bill.amount
            );
        }

        // 按日
        const day = bill.date; // YYYY-MM-DD
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

/** 读取笔记正文作为备注（跳过 frontmatter） */
export async function readBillNote(app: App, file: TFile): Promise<string> {
    const content = await app.vault.read(file);
    // 去掉 frontmatter 部分
    const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    return match ? match[1].trim() : content.trim();
}
