import { App, Modal, Notice, Setting } from "obsidian";
import type { BillEntry, BillInput, BillType, IBillStorage, PaySeeSettings } from "./types";

export class BillModal extends Modal {
    private readonly settings: PaySeeSettings;
    private readonly storage: IBillStorage;
    private readonly onSave: () => Promise<void>;
    private readonly bill?: BillEntry;
    private dateInputEl: HTMLInputElement | null = null;
    private readonly navigableFields: Array<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    > = [];

    private date: string;
    private amount = "";
    private billType: BillType = "expense";
    private category: string;
    private note = "";
    private isSubmitting = false;

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
        this.dateInputEl = null;
        this.navigableFields.length = 0;
        contentEl.addEventListener("keydown", this.handleKeydown);

        contentEl.createEl("h2", { text: this.bill ? "Edit Bill" : "New Bill" });

        new Setting(contentEl)
            .setName("Date")
            .addText((text) => {
                text.inputEl.type = "date";
                text.setValue(this.date).onChange((value) => {
                    this.date = value;
                });
                this.dateInputEl = text.inputEl;
                this.registerNavigableField(text.inputEl);
            });

        new Setting(contentEl).setName("Type").addDropdown((dropdown) => {
            dropdown
                .addOption("expense", "Expense")
                .addOption("income", "Income")
                .setValue(this.billType)
                .onChange((value) => {
                    this.billType = value as BillType;
                });
            this.registerNavigableField(dropdown.selectEl);
        });

        new Setting(contentEl)
            .setName("Amount")
            .addText((text) => {
                text.setValue(this.amount).setPlaceholder("0.00").onChange((value) => {
                    this.amount = value;
                });
                text.inputEl.type = "number";
                text.inputEl.step = "0.01";
                text.inputEl.min = "0";
                this.registerNavigableField(text.inputEl);
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
            this.registerNavigableField(dropdown.selectEl);
        });

        new Setting(contentEl)
            .setName("Note")
            .addTextArea((textarea) => {
                textarea.setPlaceholder("Optional note").setValue(this.note).onChange((value) => {
                    this.note = value;
                });
                textarea.inputEl.rows = 4;
                this.registerNavigableField(textarea.inputEl);
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
        this.contentEl.removeEventListener("keydown", this.handleKeydown);
        this.dateInputEl = null;
        this.navigableFields.length = 0;
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

    private registerNavigableField(
        field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    ): void {
        if (this.bill) {
            return;
        }

        this.navigableFields.push(field);
    }

    private handleKeydown = (event: KeyboardEvent): void => {
        if (this.bill || event.isComposing || event.keyCode === 229) {
            return;
        }

        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        if (target === this.dateInputEl && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
                return;
            }

            if (!this.shiftDateByDays(event.key === "ArrowRight" ? 1 : -1)) {
                return;
            }

            event.preventDefault();
            return;
        }

        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
                return;
            }

            if (
                target instanceof HTMLTextAreaElement &&
                !this.shouldMoveFocusFromTextarea(target, event.key)
            ) {
                return;
            }

            if (!this.moveFocus(target, event.key === "ArrowDown" ? 1 : -1)) {
                return;
            }

            event.preventDefault();
            return;
        }

        if (event.key !== "Enter") {
            return;
        }

        if (
            target instanceof HTMLTextAreaElement &&
            (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
        ) {
            return;
        }

        event.preventDefault();
        void this.submitBill();
    };

    private moveFocus(target: HTMLElement, direction: -1 | 1): boolean {
        const currentIndex = this.navigableFields.findIndex(
            (field) => field === target || field.contains(target)
        );
        if (currentIndex === -1) {
            return false;
        }

        const nextIndex = Math.max(
            0,
            Math.min(this.navigableFields.length - 1, currentIndex + direction)
        );
        if (nextIndex === currentIndex) {
            return false;
        }

        this.navigableFields[nextIndex].focus();
        return true;
    }

    private shouldMoveFocusFromTextarea(
        textarea: HTMLTextAreaElement,
        key: "ArrowUp" | "ArrowDown"
    ): boolean {
        if (textarea.selectionStart !== textarea.selectionEnd) {
            return false;
        }

        const value = textarea.value;
        const caret = textarea.selectionStart;
        if (key === "ArrowUp") {
            return value.lastIndexOf("\n", Math.max(0, caret - 1)) === -1;
        }

        return value.indexOf("\n", caret) === -1;
    }

    private shiftDateByDays(days: number): boolean {
        const currentDate = this.dateInputEl?.value || this.date;
        const parsed = moment(currentDate, "YYYY-MM-DD", true);
        if (!parsed.isValid()) {
            return false;
        }

        const nextDate = parsed.add(days, "day").format("YYYY-MM-DD");
        this.date = nextDate;

        if (this.dateInputEl) {
            this.dateInputEl.value = nextDate;
        }

        return true;
    }

    private async submitBill(): Promise<void> {
        if (this.isSubmitting) {
            return;
        }

        const input = this.buildInput();
        if (!input) {
            return;
        }

        this.isSubmitting = true;

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
        } finally {
            this.isSubmitting = false;
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
