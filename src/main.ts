import { Plugin, WorkspaceLeaf } from "obsidian";
import type { PaySeeSettings } from "./types";
import { VIEW_TYPE_PAYSEE } from "./constants";
import { PaySeeView } from "./bill-view";
import { BillModal } from "./bill-modal";
import { PaySeeSettingTab, DEFAULT_SETTINGS } from "./settings";

export default class PaySeePlugin extends Plugin {
    settings: PaySeeSettings = DEFAULT_SETTINGS;

    async onload(): Promise<void> {
        await this.loadSettings();

        // 注册侧边栏视图
        this.registerView(VIEW_TYPE_PAYSEE, (leaf) => new PaySeeView(leaf, this.settings));

        // ribbon 图标
        this.addRibbonIcon("wallet", "打开账单面板", () => {
            this.activateView();
        });

        // 命令：记一笔账
        this.addCommand({
            id: "paysee-new-bill",
            name: "记一笔账",
            callback: () => {
                new BillModal(this.app, this.settings, () => {
                    this.refreshView();
                }).open();
            },
        });

        // 命令：打开账单面板
        this.addCommand({
            id: "paysee-open-panel",
            name: "打开账单面板",
            callback: () => {
                this.activateView();
            },
        });

        // 注册设置面板
        this.addSettingTab(new PaySeeSettingTab(this.app, this));

        // 监听 vault 变更，自动刷新面板
        this.registerEvent(
            this.app.vault.on("create", (file) => {
                if (file.path.startsWith(this.settings.billFolder)) {
                    // 延迟刷新，等待 metadataCache 更新
                    setTimeout(() => this.refreshView(), 500);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("modify", (file) => {
                if (file.path.startsWith(this.settings.billFolder)) {
                    setTimeout(() => this.refreshView(), 500);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on("delete", (file) => {
                if (file.path.startsWith(this.settings.billFolder)) {
                    setTimeout(() => this.refreshView(), 500);
                }
            })
        );
    }

    onunload(): void {
        // 视图会被 Obsidian 自动清理
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        // 确保 categories 是数组
        if (!Array.isArray(this.settings.categories)) {
            this.settings.categories = [...DEFAULT_SETTINGS.categories];
        }
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        // 通知视图更新设置
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PAYSEE).forEach((leaf) => {
            if (leaf.view instanceof PaySeeView) {
                leaf.view.updateSettings(this.settings);
            }
        });
    }

    /** 激活 / 聚焦侧边栏面板 */
    async activateView(): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_PAYSEE);
        if (existing.length > 0) {
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_PAYSEE, active: true });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    /** 刷新已打开的面板 */
    private refreshView(): void {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PAYSEE).forEach((leaf) => {
            if (leaf.view instanceof PaySeeView) {
                leaf.view.refresh();
            }
        });
    }
}
