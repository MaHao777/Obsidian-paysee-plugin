export type BillType = "income" | "expense";

export interface BillEntry {
    /** 日期 YYYY-MM-DD */
    date: string;
    /** 金额（正数） */
    amount: number;
    /** 分类名称 */
    category: string;
    /** 备注 */
    note: string;
    /** 收入 / 支出 */
    type: BillType;
    /** 对应的文件路径（vault 内相对路径） */
    filePath: string;
}

export interface PaySeeSettings {
    /** 账单笔记存储目录（vault 内相对路径） */
    billFolder: string;
    /** 分类列表 */
    categories: string[];
    /** 货币符号 */
    currency: string;
}

export interface MonthlyAggregation {
    totalIncome: number;
    totalExpense: number;
    balance: number;
    byCategory: Map<string, number>;
    byDay: Map<string, { income: number; expense: number }>;
}

/** 插件接口，用于设置面板访问，避免循环引用 */
export interface IPaySeePlugin {
    settings: PaySeeSettings;
    saveSettings(): Promise<void>;
}
