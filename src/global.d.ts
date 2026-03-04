import "obsidian";

// Obsidian 在运行时提供全局 moment 函数
declare global {
    // eslint-disable-next-line no-var
    var moment: typeof import("moment");
}
