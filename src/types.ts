export type BillType = "income" | "expense";
export type BillSortMode = "date-desc" | "amount-desc";

export interface BillEntry {
    /** 唯一 ID */
    id: string;
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
    /** 创建时间 */
    createdAt: string;
    /** 更新时间 */
    updatedAt: string;
}

export interface BillInput {
    date: string;
    amount: number;
    category: string;
    note: string;
    type: BillType;
}

export interface BillMonthFile {
    version: 2;
    month: string;
    bills: BillEntry[];
}

export interface PaySeeSettings {
    /** 旧版 Markdown 账单目录（vault 内相对路径） */
    billFolder: string;
    /** 分类列表 */
    categories: string[];
    /** 货币符号 */
    currency: string;
    amountThresholds: number[];
    /** 存储版本 */
    storageVersion: number;
    /** 旧数据迁移完成时间 */
    legacyMigrationCompletedAt?: string;
}

export interface MonthlyAggregation {
    totalIncome: number;
    totalExpense: number;
    balance: number;
    byCategory: Map<string, number>;
    byDay: Map<string, { income: number; expense: number }>;
}

export interface IBillStorage {
    listBillsByMonth(year: number, month: number): Promise<BillEntry[]>;
    createBill(input: BillInput): Promise<BillEntry>;
    updateBill(id: string, patch: BillInput): Promise<BillEntry>;
    deleteBill(id: string): Promise<void>;
    migrateLegacyBillsIfNeeded(): Promise<boolean>;
}

/** 插件接口，用于设置面板访问，避免循环引用 */
export interface IPaySeePlugin {
    settings: PaySeeSettings;
    storage: IBillStorage;
    saveSettings(): Promise<void>;
}
