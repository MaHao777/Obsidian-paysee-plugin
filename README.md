# PaySee

PaySee is an Obsidian plugin for recording bills and reviewing monthly income and expense data in a side panel.

It now stores bills in plugin-private monthly JSON files instead of creating one Markdown note per bill.

## Features

- Fast bill entry from a command or ribbon action
- Monthly dashboard with income, expense, balance, pie chart, and daily bar chart
- In-plugin bill editing and deletion
- Category management in plugin settings
- Automatic migration from legacy Markdown bill files
- Mobile-safe storage approach with no SQLite dependency

## Quick Start

If you want to install the plugin manually, copy these three files:

- `main.js`
- `manifest.json`
- `styles.css`

Put them into this folder inside your vault:

```text
.obsidian/plugins/obs-paysee/
```

Do not put them into `.obsidian/snippets/`.
That folder is only for CSS snippets, not for community plugins.

After copying the files:

1. Open Obsidian.
2. Go to `Settings -> Community plugins`.
3. Reload or enable `PaySee`.

## Usage

1. Run the command `Add bill`, or click the ribbon icon.
2. Enter the date, type, amount, category, and optional note.
3. Open the PaySee panel to review the current month.
4. Click a bill row to edit or delete it.

## Keyboard Shortcuts

In the new-bill modal opened from the `Add bill` command:

- `ArrowLeft` / `ArrowRight` on the date field subtracts or adds one day
- `ArrowUp` / `ArrowDown` moves focus between date, type, amount, category, and note
- `Enter` saves the bill from any field, including the note textarea
- `Shift+Enter` inserts a newline inside the note textarea

## Storage

New bills are stored under the plugin config directory as monthly JSON shards:

```text
.obsidian/plugins/obs-paysee/bills/YYYY-MM.json
```

Legacy Markdown bills from the configured bill folder can be migrated automatically.
Backups of migrated legacy files are stored under:

```text
.obsidian/plugin-backups/
```

## Settings

- `Legacy Markdown Folder`: source folder used only for importing and backing up old bill notes
- `Currency Symbol`: prefix displayed before amounts
- `Categories`: list used by the bill entry form

## Development

```bash
npm install
npm run dev
npm run build
```

`npm run build` writes the production bundle to `main.js` in the project root.

## File Layout

```text
src/
main.js
manifest.json
styles.css
README.md
```

## License

MIT
