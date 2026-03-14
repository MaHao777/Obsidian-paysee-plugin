import { Plugin } from "obsidian";
import type { PaySeeSettings } from "./types";
import { VIEW_TYPE_PAYSEE } from "./constants";
import { PaySeeView } from "./bill-view";
import { BillModal } from "./bill-modal";
import { PaySeeSettingTab, DEFAULT_SETTINGS } from "./settings";
import { BillStorage } from "./bill-storage";

export default class PaySeePlugin extends Plugin {
    settings: PaySeeSettings = DEFAULT_SETTINGS;
    storage!: BillStorage;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.storage = new BillStorage(
            this.app,
            this.manifest.id,
            () => this.settings,
            async () => {
                await this.saveSettings();
            }
        );

        await this.storage.migrateLegacyBillsIfNeeded();

        this.registerView(
            VIEW_TYPE_PAYSEE,
            (leaf) => new PaySeeView(leaf, this.settings, this.storage)
        );

        this.addRibbonIcon("wallet", "Open PaySee panel", () => {
            void this.activateView();
        });

        this.addCommand({
            id: "paysee-new-bill",
            name: "Add bill",
            callback: () => {
                new BillModal(
                    this.app,
                    this.settings,
                    this.storage,
                    async () => {
                        this.refreshView();
                    }
                ).open();
            },
        });

        this.addCommand({
            id: "paysee-open-panel",
            name: "Open bill panel",
            callback: () => {
                void this.activateView();
            },
        });

        this.addSettingTab(new PaySeeSettingTab(this.app, this));
    }

    onunload(): void {
        // Obsidian cleans up views automatically.
    }

    async loadSettings(): Promise<void> {
        const loaded = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

        if (!Array.isArray(this.settings.categories)) {
            this.settings.categories = [...DEFAULT_SETTINGS.categories];
        }

        this.settings.storageVersion =
            typeof loaded?.storageVersion === "number" ? loaded.storageVersion : 1;

        if (typeof loaded?.legacyMigrationCompletedAt === "string") {
            this.settings.legacyMigrationCompletedAt = loaded.legacyMigrationCompletedAt;
        } else {
            delete this.settings.legacyMigrationCompletedAt;
        }
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PAYSEE).forEach((leaf) => {
            if (leaf.view instanceof PaySeeView) {
                leaf.view.updateSettings(this.settings);
                void leaf.view.refresh();
            }
        });
    }

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

    private refreshView(): void {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_PAYSEE).forEach((leaf) => {
            if (leaf.view instanceof PaySeeView) {
                void leaf.view.refresh();
            }
        });
    }
}
