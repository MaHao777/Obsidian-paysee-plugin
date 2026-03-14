import { App, PluginSettingTab, Setting, Plugin } from "obsidian";
import { DEFAULT_BILL_FOLDER, DEFAULT_CATEGORIES, DEFAULT_CURRENCY } from "./constants";
import type { PaySeeSettings, IPaySeePlugin } from "./types";

export const DEFAULT_SETTINGS: PaySeeSettings = {
    billFolder: DEFAULT_BILL_FOLDER,
    categories: [...DEFAULT_CATEGORIES],
    currency: DEFAULT_CURRENCY,
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
                    if (!name) return;
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
