import { App, Modal, Notice, Setting } from "obsidian";
import type { BillType, PaySeeSettings } from "./types";

export class BillModal extends Modal {
    private settings: PaySeeSettings;
    private onSave: () => void;

    private date: string;
    private amount: string = "";
    private billType: BillType = "expense";
    private category: string;
    private note: string = "";

    constructor(app: App, settings: PaySeeSettings, onSave: () => void) {
        super(app);
        this.settings = settings;
        this.onSave = onSave;
        this.date = moment().format("YYYY-MM-DD");
        this.category = settings.categories[0] || "其他";
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("paysee-modal");

        contentEl.createEl("h2", { text: "记一笔账" });

        // ── 日期 ──
        new Setting(contentEl)
            .setName("日期")
            .addText((text) =>
                text
                    .setValue(this.date)
                    .setPlaceholder("YYYY-MM-DD")
                    .onChange((v) => (this.date = v))
            );

        // ── 收入 / 支出 切换 ──
        new Setting(contentEl).setName("类型").addDropdown((dd) =>
            dd
                .addOption("expense", "支出")
                .addOption("income", "收入")
                .setValue(this.billType)
                .onChange((v) => {
                    this.billType = v as BillType;
                })
        );

        // ── 金额 ──
        new Setting(contentEl)
            .setName("金额")
            .addText((text) => {
                text.setPlaceholder("0.00").onChange((v) => (this.amount = v));
                text.inputEl.type = "number";
                text.inputEl.step = "0.01";
                text.inputEl.min = "0";
            });

        // ── 分类 ──
        new Setting(contentEl).setName("分类").addDropdown((dd) => {
            for (const cat of this.settings.categories) {
                dd.addOption(cat, cat);
            }
            dd.setValue(this.category);
            dd.onChange((v) => (this.category = v));
        });

        // ── 备注 ──
        new Setting(contentEl)
            .setName("备注")
            .addTextArea((ta) => {
                ta.setPlaceholder("可选备注…").onChange((v) => (this.note = v));
                ta.inputEl.rows = 3;
            });

        // ── 提交按钮 ──
        new Setting(contentEl).addButton((btn) =>
            btn
                .setButtonText("保存")
                .setCta()
                .onClick(async () => {
                    await this.saveBill();
                })
        );
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async saveBill(): Promise<void> {
        // 验证
        const amt = parseFloat(this.amount);
        if (isNaN(amt) || amt <= 0) {
            new Notice("请输入有效的金额");
            return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) {
            new Notice("日期格式应为 YYYY-MM-DD");
            return;
        }

        const folder = this.settings.billFolder;

        // 确保目录存在
        if (!this.app.vault.getAbstractFileByPath(folder)) {
            await this.app.vault.createFolder(folder);
        }

        // 生成文件名: YYYY-MM-DD_HHmmss.md
        const timestamp = moment().format("YYYY-MM-DD_HHmmss");
        const fileName = `${folder}/${timestamp}.md`;

        // 构建文件内容
        const lines = [
            "---",
            `date: ${this.date}`,
            `amount: ${amt}`,
            `category: ${this.category}`,
            `type: ${this.billType}`,
            "---",
        ];
        if (this.note.trim()) {
            lines.push("", this.note.trim());
        }

        try {
            await this.app.vault.create(fileName, lines.join("\n"));
            new Notice(`账单已保存：${this.settings.currency}${amt} ${this.category}`);
            this.onSave();
            this.close();
        } catch (e) {
            new Notice("保存失败：" + (e as Error).message);
        }
    }
}
