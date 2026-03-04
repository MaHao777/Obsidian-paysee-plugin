import { App, PluginSettingTab, Setting, Plugin } from "obsidian";
import { DEFAULT_BILL_FOLDER, DEFAULT_CATEGORIES, DEFAULT_CURRENCY } from "./constants";
import type { PaySeeSettings, IPaySeePlugin } from "./types";

export const DEFAULT_SETTINGS: PaySeeSettings = {
    billFolder: DEFAULT_BILL_FOLDER,
    categories: [...DEFAULT_CATEGORIES],
    currency: DEFAULT_CURRENCY,
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

        containerEl.createEl("h2", { text: "PaySee 设置" });

        // ── 存储路径 ──
        new Setting(containerEl)
            .setName("账单存储路径")
            .setDesc("账单笔记存储在 vault 中的文件夹路径")
            .addText((text) =>
                text
                    .setPlaceholder("PaySee")
                    .setValue(this.plugin.settings.billFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.billFolder = value.trim() || DEFAULT_BILL_FOLDER;
                        await this.plugin.saveSettings();
                    })
            );

        // ── 货币符号 ──
        new Setting(containerEl)
            .setName("货币符号")
            .setDesc("显示在金额前的货币符号")
            .addText((text) =>
                text
                    .setPlaceholder("¥")
                    .setValue(this.plugin.settings.currency)
                    .onChange(async (value) => {
                        this.plugin.settings.currency = value.trim() || DEFAULT_CURRENCY;
                        await this.plugin.saveSettings();
                    })
            );

        // ── 分类管理 ──
        containerEl.createEl("h3", { text: "分类管理" });

        const categoriesContainer = containerEl.createDiv("paysee-categories-list");
        this.renderCategories(categoriesContainer);

        // 新增分类
        new Setting(containerEl)
            .setName("新增分类")
            .setDesc("输入名称后点击添加")
            .addText((text) => {
                text.setPlaceholder("输入分类名称");
                text.inputEl.addClass("paysee-new-category-input");
            })
            .addButton((btn) =>
                btn.setButtonText("添加").setCta().onClick(async () => {
                    const input = containerEl.querySelector(
                        ".paysee-new-category-input"
                    ) as HTMLInputElement;
                    const name = input?.value?.trim();
                    if (!name) return;
                    if (this.plugin.settings.categories.includes(name)) {
                        return; // 已存在
                    }
                    this.plugin.settings.categories.push(name);
                    await this.plugin.saveSettings();
                    input.value = "";
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
                    btn.setIcon("up-chevron-glyph").setTooltip("上移").onClick(async () => {
                        if (idx === 0) return;
                        const arr = this.plugin.settings.categories;
                        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                        await this.plugin.saveSettings();
                        this.renderCategories(container);
                    })
                )
                .addExtraButton((btn) =>
                    btn.setIcon("down-chevron-glyph").setTooltip("下移").onClick(async () => {
                        const arr = this.plugin.settings.categories;
                        if (idx === arr.length - 1) return;
                        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                        await this.plugin.saveSettings();
                        this.renderCategories(container);
                    })
                )
                .addExtraButton((btn) =>
                    btn.setIcon("cross").setTooltip("删除").onClick(async () => {
                        this.plugin.settings.categories.splice(idx, 1);
                        await this.plugin.saveSettings();
                        this.renderCategories(container);
                    })
                );
        });
    }
}
