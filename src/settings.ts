import { App, Notice, PluginSettingTab, Setting, Plugin } from "obsidian";
import {
    DEFAULT_AMOUNT_THRESHOLDS,
    DEFAULT_BILL_FOLDER,
    DEFAULT_CATEGORIES,
    DEFAULT_CURRENCY,
} from "./constants";
import { getAmountBuckets, normalizeAmountThresholds } from "./bill-parser";
import type { PaySeeSettings, IPaySeePlugin } from "./types";

export const DEFAULT_SETTINGS: PaySeeSettings = {
    billFolder: DEFAULT_BILL_FOLDER,
    categories: [...DEFAULT_CATEGORIES],
    currency: DEFAULT_CURRENCY,
    amountThresholds: [...DEFAULT_AMOUNT_THRESHOLDS],
    storageVersion: 2,
};

export class PaySeeSettingTab extends PluginSettingTab {
    plugin: IPaySeePlugin & Plugin;

    constructor(app: App, plugin: IPaySeePlugin & Plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "PaySee Settings" });

        new Setting(containerEl)
            .setName("Legacy Markdown Folder")
            .setDesc("Used only for migrating and backing up old bills. New bills are stored privately.")
            .addText((text) =>
                text
                    .setPlaceholder("PaySee")
                    .setValue(this.plugin.settings.billFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.billFolder = value.trim() || DEFAULT_BILL_FOLDER;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Currency Symbol")
            .setDesc("Prefix shown before bill amounts")
            .addText((text) =>
                text
                    .setPlaceholder("$")
                    .setValue(this.plugin.settings.currency)
                    .onChange(async (value) => {
                        this.plugin.settings.currency = value.trim() || DEFAULT_CURRENCY;
                        await this.plugin.saveSettings();
                    })
            );

        containerEl.createEl("h3", { text: "Amount Buckets" });
        containerEl.createEl("p", {
            text: "Each threshold starts a new amount bucket. Labels are generated automatically.",
            cls: "paysee-settings-hint",
        });

        const thresholdPreviewContainer = containerEl.createDiv("paysee-threshold-preview");
        const thresholdListContainer = containerEl.createDiv("paysee-threshold-list");
        this.renderAmountThresholdPreview(thresholdPreviewContainer);
        this.renderAmountThresholds(thresholdListContainer, thresholdPreviewContainer);

        new Setting(containerEl)
            .setName("Add Threshold")
            .setDesc("Enter the amount where a new bucket should start")
            .addText((text) => {
                text.setPlaceholder("1000");
                text.inputEl.type = "number";
                text.inputEl.step = "0.01";
                text.inputEl.min = "0.01";
                text.inputEl.addClass("paysee-new-threshold-input");
            })
            .addButton((btn) =>
                btn.setButtonText("Add").setCta().onClick(async () => {
                    const input = containerEl.querySelector(
                        ".paysee-new-threshold-input"
                    ) as HTMLInputElement | null;
                    const value = Number(input?.value);

                    if (!Number.isFinite(value) || value <= 0) {
                        new Notice("Please enter a positive amount threshold");
                        return;
                    }

                    const current = normalizeAmountThresholds(this.plugin.settings.amountThresholds);
                    const next = normalizeAmountThresholds([...current, value]);
                    if (next.length === current.length) {
                        new Notice("That threshold already exists");
                        if (input) {
                            input.value = "";
                        }
                        return;
                    }

                    await this.saveAmountThresholds(next);
                    if (input) {
                        input.value = "";
                    }
                    this.renderAmountThresholdPreview(thresholdPreviewContainer);
                    this.renderAmountThresholds(
                        thresholdListContainer,
                        thresholdPreviewContainer
                    );
                })
            );

        containerEl.createEl("h3", { text: "Categories" });

        const categoriesContainer = containerEl.createDiv("paysee-categories-list");
        this.renderCategories(categoriesContainer);

        new Setting(containerEl)
            .setName("Add Category")
            .setDesc("Enter a name and click Add")
            .addText((text) => {
                text.setPlaceholder("Category name");
                text.inputEl.addClass("paysee-new-category-input");
            })
            .addButton((btn) =>
                btn.setButtonText("Add").setCta().onClick(async () => {
                    const input = containerEl.querySelector(
                        ".paysee-new-category-input"
                    ) as HTMLInputElement | null;
                    const name = input?.value?.trim();
                    if (!name) {
                        return;
                    }
                    if (this.plugin.settings.categories.includes(name)) {
                        return;
                    }
                    this.plugin.settings.categories.push(name);
                    await this.plugin.saveSettings();
                    if (input) {
                        input.value = "";
                    }
                    this.renderCategories(categoriesContainer);
                })
            );
    }

    private renderAmountThresholdPreview(container: HTMLElement): void {
        container.empty();

        container.createEl("div", {
            text: "Preview",
            cls: "paysee-threshold-preview-label",
        });

        const chips = container.createDiv("paysee-threshold-preview-chips");
        const buckets = getAmountBuckets(this.plugin.settings.amountThresholds);
        for (const bucket of buckets) {
            chips.createEl("span", {
                text: bucket.label,
                cls: "paysee-threshold-chip",
            });
        }
    }

    private renderAmountThresholds(
        container: HTMLElement,
        previewContainer: HTMLElement
    ): void {
        container.empty();

        const thresholds = normalizeAmountThresholds(this.plugin.settings.amountThresholds);
        thresholds.forEach((threshold, idx) => {
            const setting = new Setting(container).setName(`Threshold ${idx + 1}`);
            setting.setDesc(`Bucket ${idx + 2} starts at this amount`);

            setting.addText((text) => {
                text.setValue(String(threshold));
                text.inputEl.type = "number";
                text.inputEl.step = "0.01";
                text.inputEl.min = "0.01";
                text.inputEl.addEventListener("change", () => {
                    void this.updateAmountThreshold(
                        idx,
                        text.inputEl.value,
                        container,
                        previewContainer
                    );
                });
            });

            if (thresholds.length > 1) {
                setting.addExtraButton((btn) =>
                    btn.setIcon("cross")
                        .setTooltip("Delete threshold")
                        .onClick(async () => {
                            const next = thresholds.filter((_, index) => index !== idx);
                            await this.saveAmountThresholds(next);
                            this.renderAmountThresholdPreview(previewContainer);
                            this.renderAmountThresholds(container, previewContainer);
                        })
                );
            }
        });
    }

    private async updateAmountThreshold(
        index: number,
        rawValue: string,
        container: HTMLElement,
        previewContainer: HTMLElement
    ): Promise<void> {
        const value = Number(rawValue);
        if (!Number.isFinite(value) || value <= 0) {
            new Notice("Threshold must be a positive number");
            this.renderAmountThresholds(container, previewContainer);
            return;
        }

        const nextThresholds = [...normalizeAmountThresholds(this.plugin.settings.amountThresholds)];
        nextThresholds[index] = value;
        await this.saveAmountThresholds(nextThresholds);
        this.renderAmountThresholdPreview(previewContainer);
        this.renderAmountThresholds(container, previewContainer);
    }

    private async saveAmountThresholds(thresholds: number[]): Promise<void> {
        this.plugin.settings.amountThresholds = normalizeAmountThresholds(
            thresholds,
            DEFAULT_AMOUNT_THRESHOLDS
        );
        await this.plugin.saveSettings();
    }

    private renderCategories(container: HTMLElement): void {
        container.empty();
        this.plugin.settings.categories.forEach((cat: string, idx: number) => {
            new Setting(container)
                .setName(cat)
                .addExtraButton((btn) =>
                    btn.setIcon("up-chevron-glyph").setTooltip("Move up").onClick(async () => {
                        if (idx === 0) return;
                        const arr = this.plugin.settings.categories;
                        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                        await this.plugin.saveSettings();
                        this.renderCategories(container);
                    })
                )
                .addExtraButton((btn) =>
                    btn.setIcon("down-chevron-glyph").setTooltip("Move down").onClick(async () => {
                        const arr = this.plugin.settings.categories;
                        if (idx === arr.length - 1) return;
                        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                        await this.plugin.saveSettings();
                        this.renderCategories(container);
                    })
                )
                .addExtraButton((btn) =>
                    btn.setIcon("cross").setTooltip("Delete").onClick(async () => {
                        this.plugin.settings.categories.splice(idx, 1);
                        await this.plugin.saveSettings();
                        this.renderCategories(container);
                    })
                );
        });
    }
}
