import { App, Modal, Notice, Setting } from "obsidian";
import type { BillEntry, BillInput, BillType, IBillStorage, PaySeeSettings } from "./types";

export class BillModal extends Modal {
    private readonly settings: PaySeeSettings;
    private readonly storage: IBillStorage;
    private readonly onSave: () => Promise<void>;
    private readonly bill?: BillEntry;

    private date: string;
    private amount = "";
    private billType: BillType = "expense";
    private category: string;
    private note = "";

    constructor(
        app: App,
        settings: PaySeeSettings,
        storage: IBillStorage,
        onSave: () => Promise<void>,
        bill?: BillEntry
    ) {
        super(app);
        this.settings = settings;
        this.storage = storage;
        this.onSave = onSave;
        this.bill = bill;

        this.date = bill?.date || moment().format("YYYY-MM-DD");
        this.amount = bill ? bill.amount.toFixed(2) : "";
        this.billType = bill?.type || "expense";
        this.category = bill?.category || settings.categories[0] || "Other";
        this.note = bill?.note || "";
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("paysee-modal");

        contentEl.createEl("h2", { text: this.bill ? "Edit Bill" : "New Bill" });

        new Setting(contentEl)
            .setName("Date")
            .addText((text) =>
                text
                    .setValue(this.date)
                    .setPlaceholder("YYYY-MM-DD")
                    .onChange((value) => {
                        this.date = value;
                    })
            );

        new Setting(contentEl).setName("Type").addDropdown((dropdown) =>
            dropdown
                .addOption("expense", "Expense")
                .addOption("income", "Income")
                .setValue(this.billType)
                .onChange((value) => {
                    this.billType = value as BillType;
                })
        );

        new Setting(contentEl)
            .setName("Amount")
            .addText((text) => {
                text.setValue(this.amount).setPlaceholder("0.00").onChange((value) => {
                    this.amount = value;
                });
                text.inputEl.type = "number";
                text.inputEl.step = "0.01";
                text.inputEl.min = "0";
            });

        new Setting(contentEl).setName("Category").addDropdown((dropdown) => {
            const categories = this.getCategoryOptions();
            for (const category of categories) {
                dropdown.addOption(category, category);
            }
            dropdown.setValue(this.category);
            dropdown.onChange((value) => {
                this.category = value;
            });
        });

        new Setting(contentEl)
            .setName("Note")
            .addTextArea((textarea) => {
                textarea.setPlaceholder("Optional note").setValue(this.note).onChange((value) => {
                    this.note = value;
                });
                textarea.inputEl.rows = 4;
            });

        const actions = new Setting(contentEl);
        if (this.bill) {
            actions.addButton((button) =>
                button.setButtonText("Delete").onClick(async () => {
                    await this.deleteBill();
                })
            );
        }
        actions.addButton((button) =>
            button
                .setButtonText(this.bill ? "Save Changes" : "Save")
                .setCta()
                .onClick(async () => {
                    await this.submitBill();
                })
        );
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private getCategoryOptions(): string[] {
        const categories = [...this.settings.categories];
        if (this.category && !categories.includes(this.category)) {
            categories.push(this.category);
        }
        if (categories.length === 0) {
            categories.push("Other");
        }
        return categories;
    }

    private buildInput(): BillInput | null {
        const amount = Number(this.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            new Notice("Please enter a valid amount");
            return null;
        }

        const date = this.date.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            new Notice("Date must use YYYY-MM-DD");
            return null;
        }

        return {
            date,
            amount,
            category: this.category.trim() || "Other",
            note: this.note.trim(),
            type: this.billType,
        };
    }

    private async submitBill(): Promise<void> {
        const input = this.buildInput();
        if (!input) {
            return;
        }

        try {
            if (this.bill) {
                await this.storage.updateBill(this.bill.id, input);
                new Notice("Bill updated");
            } else {
                await this.storage.createBill(input);
                new Notice(`Bill saved: ${this.settings.currency}${input.amount} ${input.category}`);
            }

            await this.onSave();
            this.close();
        } catch (error) {
            new Notice(`Save failed: ${(error as Error).message}`);
        }
    }

    private async deleteBill(): Promise<void> {
        if (!this.bill) {
            return;
        }

        if (!window.confirm("Delete this bill?")) {
            return;
        }

        try {
            await this.storage.deleteBill(this.bill.id);
            new Notice("Bill deleted");
            await this.onSave();
            this.close();
        } catch (error) {
            new Notice(`Delete failed: ${(error as Error).message}`);
        }
    }
}
