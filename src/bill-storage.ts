import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type {
    BillEntry,
    BillInput,
    BillMonthFile,
    BillType,
    IBillStorage,
    PaySeeSettings,
} from "./types";

type LegacyBillRecord = BillInput & {
    sourceFile: TFile;
    sourceContent: string;
};

type LocatedBill = {
    bill: BillEntry;
    index: number;
    monthFile: BillMonthFile;
    monthKey: string;
};

function isBillType(value: unknown): value is BillType {
    return value === "income" || value === "expense";
}

export class BillStorage implements IBillStorage {
    constructor(
        private readonly app: App,
        private readonly manifestId: string,
        private readonly getSettings: () => PaySeeSettings,
        private readonly persistSettings: () => Promise<void>
    ) {}

    async listBillsByMonth(year: number, month: number): Promise<BillEntry[]> {
        const monthKey = this.toMonthKey(year, month);
        const monthFile = await this.readMonthFile(monthKey);
        return [...monthFile.bills];
    }

    async createBill(input: BillInput): Promise<BillEntry> {
        const normalized = this.normalizeBillInput(input);
        const now = new Date().toISOString();
        const entry: BillEntry = {
            id: this.createBillId(),
            ...normalized,
            createdAt: now,
            updatedAt: now,
        };

        const monthKey = this.getMonthKeyFromDate(entry.date);
        const monthFile = await this.readMonthFile(monthKey);
        monthFile.bills.push(entry);
        await this.writeMonthFile(monthFile);
        return entry;
    }

    async updateBill(id: string, patch: BillInput): Promise<BillEntry> {
        const located = await this.findBillById(id);
        if (!located) {
            throw new Error("Bill not found for update");
        }

        const normalized = this.normalizeBillInput(patch);
        const updatedBill: BillEntry = {
            ...located.bill,
            ...normalized,
            updatedAt: new Date().toISOString(),
        };

        const nextMonthKey = this.getMonthKeyFromDate(updatedBill.date);

        if (nextMonthKey !== located.monthKey) {
            const nextMonthFile = await this.readMonthFile(nextMonthKey);
            nextMonthFile.bills = nextMonthFile.bills.filter((bill) => bill.id !== id);
            nextMonthFile.bills.push(updatedBill);
            await this.writeMonthFile(nextMonthFile);

            located.monthFile.bills.splice(located.index, 1);
            await this.writeMonthFile(located.monthFile);
            return updatedBill;
        }

        located.monthFile.bills[located.index] = updatedBill;
        await this.writeMonthFile(located.monthFile);
        return updatedBill;
    }

    async deleteBill(id: string): Promise<void> {
        const located = await this.findBillById(id);
        if (!located) {
            throw new Error("Bill not found for deletion");
        }

        located.monthFile.bills.splice(located.index, 1);
        await this.writeMonthFile(located.monthFile);
    }

    async migrateLegacyBillsIfNeeded(): Promise<boolean> {
        const settings = this.getSettings();
        if (settings.storageVersion >= 2) {
            return false;
        }

        const completedAt = new Date().toISOString();
        const legacyFiles = this.getLegacyMarkdownFiles(settings.billFolder);

        if (legacyFiles.length === 0) {
            settings.storageVersion = 2;
            settings.legacyMigrationCompletedAt = completedAt;
            await this.persistSettings();
            return false;
        }

        const migratedByMonth = new Map<string, BillEntry[]>();
        const migratedLegacyFiles: LegacyBillRecord[] = [];
        let skippedCount = 0;

        for (const file of legacyFiles) {
            const parsed = await this.parseLegacyBillFile(file);
            if (!parsed) {
                skippedCount += 1;
                continue;
            }

            migratedLegacyFiles.push(parsed);

            const monthKey = this.getMonthKeyFromDate(parsed.date);
            const createdAt = new Date(parsed.sourceFile.stat.mtime).toISOString();
            const migratedEntry: BillEntry = {
                id: this.createBillId(),
                date: parsed.date,
                amount: parsed.amount,
                category: parsed.category,
                note: parsed.note,
                type: parsed.type,
                createdAt,
                updatedAt: createdAt,
            };

            const bucket = migratedByMonth.get(monthKey) || [];
            bucket.push(migratedEntry);
            migratedByMonth.set(monthKey, bucket);
        }

        for (const [monthKey, bills] of migratedByMonth.entries()) {
            const monthFile = await this.readMonthFile(monthKey);
            if (monthFile.bills.length > 0) {
                continue;
            }

            monthFile.bills = bills;
            await this.writeMonthFile(monthFile);
        }

        const backupStamp = moment().format("YYYYMMDD-HHmmss");
        for (const record of migratedLegacyFiles) {
            const backupPath = normalizePath(
                `${this.backupRootDir}/${backupStamp}/${record.sourceFile.path}`
            );
            await this.writeTextFile(backupPath, record.sourceContent);
        }

        for (const record of migratedLegacyFiles) {
            await this.app.vault.delete(record.sourceFile, true);
        }

        settings.storageVersion = 2;
        settings.legacyMigrationCompletedAt = completedAt;
        await this.persistSettings();

        if (migratedLegacyFiles.length > 0) {
            new Notice(`PaySee migrated ${migratedLegacyFiles.length} legacy bills`);
        }
        if (skippedCount > 0) {
            new Notice(`PaySee skipped ${skippedCount} invalid legacy bill files`);
        }

        return migratedLegacyFiles.length > 0;
    }

    private get pluginDataDir(): string {
        return normalizePath(`${this.app.vault.configDir}/plugins/${this.manifestId}`);
    }

    private get billsDir(): string {
        return normalizePath(`${this.pluginDataDir}/bills`);
    }

    private get backupRootDir(): string {
        return normalizePath(`${this.pluginDataDir}/legacy-backup`);
    }

    private toMonthKey(year: number, month: number): string {
        return `${year}-${String(month).padStart(2, "0")}`;
    }

    private getMonthKeyFromDate(date: string): string {
        return date.slice(0, 7);
    }

    private getMonthFilePath(monthKey: string): string {
        return normalizePath(`${this.billsDir}/${monthKey}.json`);
    }

    private async readMonthFile(monthKey: string): Promise<BillMonthFile> {
        const path = this.getMonthFilePath(monthKey);
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists(path))) {
            return this.createEmptyMonthFile(monthKey);
        }

        try {
            const content = await adapter.read(path);
            const parsed = JSON.parse(content) as Partial<BillMonthFile>;
            const bills = Array.isArray(parsed.bills)
                ? parsed.bills
                      .map((bill) => this.coerceStoredBill(bill))
                      .filter((bill): bill is BillEntry => bill !== null)
                : [];

            return {
                version: 2,
                month:
                    typeof parsed.month === "string" && parsed.month.trim()
                        ? parsed.month
                        : monthKey,
                bills,
            };
        } catch (error) {
            console.warn("[PaySee] Failed to read monthly bill file:", path, error);
            return this.createEmptyMonthFile(monthKey);
        }
    }

    private async writeMonthFile(monthFile: BillMonthFile): Promise<void> {
        const normalized: BillMonthFile = {
            version: 2,
            month: monthFile.month,
            bills: this.sortStoredBills(monthFile.bills),
        };
        const path = this.getMonthFilePath(monthFile.month);
        const adapter = this.app.vault.adapter;

        if (normalized.bills.length === 0) {
            if (await adapter.exists(path)) {
                await adapter.remove(path);
            }
            return;
        }

        await this.writeTextFile(path, JSON.stringify(normalized, null, 2));
    }

    private async writeTextFile(path: string, content: string): Promise<void> {
        const parentDir = this.getParentDir(path);
        if (parentDir) {
            await this.ensureDir(parentDir);
        }
        await this.app.vault.adapter.write(path, content);
    }

    private async ensureDir(path: string): Promise<void> {
        const adapter = this.app.vault.adapter;
        const segments = normalizePath(path).split("/").filter(Boolean);
        let current = "";

        for (const segment of segments) {
            current = current ? `${current}/${segment}` : segment;
            if (!(await adapter.exists(current))) {
                await adapter.mkdir(current);
            }
        }
    }

    private getParentDir(path: string): string {
        const normalized = normalizePath(path);
        const lastSlash = normalized.lastIndexOf("/");
        return lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
    }

    private async findBillById(id: string): Promise<LocatedBill | null> {
        const monthFiles = await this.listMonthFiles();
        for (const path of monthFiles) {
            const monthKey = this.getMonthKeyFromPath(path);
            const monthFile = await this.readMonthFile(monthKey);
            const index = monthFile.bills.findIndex((bill) => bill.id === id);
            if (index >= 0) {
                return {
                    bill: monthFile.bills[index],
                    index,
                    monthFile,
                    monthKey,
                };
            }
        }

        return null;
    }

    private async listMonthFiles(): Promise<string[]> {
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists(this.billsDir))) {
            return [];
        }

        const listed = await adapter.list(this.billsDir);
        return listed.files
            .filter((path) => path.endsWith(".json"))
            .sort((a, b) => a.localeCompare(b));
    }

    private getMonthKeyFromPath(path: string): string {
        const fileName = path.split("/").pop() || "";
        return fileName.replace(/\.json$/i, "");
    }

    private createEmptyMonthFile(monthKey: string): BillMonthFile {
        return {
            version: 2,
            month: monthKey,
            bills: [],
        };
    }

    private normalizeBillInput(input: BillInput): BillInput {
        return {
            date: String(input.date).trim(),
            amount: Math.abs(Number(input.amount)),
            category: String(input.category).trim() || "Other",
            note: String(input.note || "").trim(),
            type: input.type === "income" ? "income" : "expense",
        };
    }

    private coerceStoredBill(raw: unknown): BillEntry | null {
        if (!raw || typeof raw !== "object") {
            return null;
        }

        const source = raw as Partial<BillEntry>;
        const id = typeof source.id === "string" ? source.id.trim() : "";
        const date = typeof source.date === "string" ? source.date.trim() : "";
        const amount = Number(source.amount);
        const category = typeof source.category === "string" ? source.category.trim() : "";
        const note = typeof source.note === "string" ? source.note : "";
        const type = source.type;
        const createdAt =
            typeof source.createdAt === "string" && source.createdAt
                ? source.createdAt
                : new Date().toISOString();
        const updatedAt =
            typeof source.updatedAt === "string" && source.updatedAt
                ? source.updatedAt
                : createdAt;

        if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || !category) {
            return null;
        }
        if (!isBillType(type)) {
            return null;
        }

        return {
            id,
            date,
            amount: Math.abs(amount),
            category,
            note,
            type,
            createdAt,
            updatedAt,
        };
    }

    private sortStoredBills(bills: BillEntry[]): BillEntry[] {
        return [...bills].sort((a, b) => {
            const dateDiff = b.date.localeCompare(a.date);
            if (dateDiff !== 0) return dateDiff;
            return b.createdAt.localeCompare(a.createdAt);
        });
    }

    private getLegacyMarkdownFiles(folderPath: string): TFile[] {
        const normalizedFolder = folderPath.trim();
        if (!normalizedFolder) {
            return [];
        }

        const root = this.app.vault.getAbstractFileByPath(normalizedFolder);
        if (!(root instanceof TFolder)) {
            return [];
        }

        return this.collectMarkdownFiles(root);
    }

    private collectMarkdownFiles(folder: TFolder): TFile[] {
        const files: TFile[] = [];
        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === "md") {
                files.push(child);
                continue;
            }
            if (child instanceof TFolder) {
                files.push(...this.collectMarkdownFiles(child));
            }
        }
        return files;
    }

    private async parseLegacyBillFile(file: TFile): Promise<LegacyBillRecord | null> {
        try {
            const content = await this.app.vault.read(file);
            const normalized = content.replace(/\r\n/g, "\n");
            const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
            if (!match) {
                console.warn("[PaySee] Skip legacy bill without frontmatter:", file.path);
                return null;
            }

            const frontmatter = this.parseLegacyFrontmatter(match[1]);
            const bodyNote = match[2].trim();
            const date = String(frontmatter.date || "").trim();
            const amount = Number(frontmatter.amount);
            const category = String(frontmatter.category || "").trim();
            const type = String(frontmatter.type || "").trim();
            const note = bodyNote || String(frontmatter.note || "").trim();

            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || !category) {
                console.warn("[PaySee] Skip invalid legacy bill:", file.path);
                return null;
            }
            if (!isBillType(type)) {
                console.warn("[PaySee] Skip legacy bill with invalid type:", file.path);
                return null;
            }

            return {
                sourceFile: file,
                sourceContent: content,
                date,
                amount: Math.abs(amount),
                category,
                note,
                type,
            };
        } catch (error) {
            console.warn("[PaySee] Failed to migrate legacy bill:", file.path, error);
            return null;
        }
    }

    private parseLegacyFrontmatter(block: string): Record<string, string> {
        const result: Record<string, string> = {};
        for (const rawLine of block.split("\n")) {
            const line = rawLine.trim();
            if (!line) continue;

            const separatorIndex = line.indexOf(":");
            if (separatorIndex < 0) continue;

            const key = line.slice(0, separatorIndex).trim();
            const value = line.slice(separatorIndex + 1).trim();
            result[key] = this.stripWrappingQuotes(value);
        }
        return result;
    }

    private stripWrappingQuotes(value: string): string {
        if (value.length < 2) return value;
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === "'" && last === "'") || (first === "\"" && last === "\"")) {
            return value.slice(1, -1);
        }
        return value;
    }

    private createBillId(): string {
        const cryptoApi = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
        if (cryptoApi?.randomUUID) {
            return cryptoApi.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    }
}
