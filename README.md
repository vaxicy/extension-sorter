<div align="center">
  <img src="https://raw.githubusercontent.com/vaxicy/extension-sorter/master/resources/icon.png" alt="Extension Sorter icon" width="96">
  <h1 align="center">Extension Sorter</h1>
  <p>See your installed extensions in the order you actually installed them — and open the real details page in one click.</p>
  <p>
    <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version 1.0.0">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License MIT">
    <a href="https://marketplace.visualstudio.com/items?itemName=lilinhuang.extension-sorter"><img src="https://img.shields.io/badge/VS%20Code-Extension-1F6FEB?logo=visual-studio-code&amp;logoColor=white" alt="VS Code Extension"></a>
    <a href="https://github.com/vaxicy/extension-sorter"><img src="https://img.shields.io/badge/GitHub-Repository-181717?logo=github&amp;logoColor=white" alt="GitHub"></a>
  </p>
</div>

**English** | [简体中文](README.zh-CN.md)

VS Code can sort your extensions by install date, but only *inside* the built-in Extensions view: you get one long list that mixes themes, tools and everything else, and there is no way to say "show me what I installed last week". Extension Sorter adds a second view next to it that is built for exactly that question.

**Contents**

- [✨ Highlights](#-highlights)
- [🚀 Install](#-install)
- [🧭 Usage](#-usage)
- [📅 Where the install date comes from](#-where-the-install-date-comes-from)
- [🧩 Settings](#-settings)
- [🔧 Commands](#-commands)
- [🔒 Privacy](#-privacy)
- [🧪 Development](#-development)
- [📝 Changelog](#-changelog)
- [📄 License](#-license)

---

## ✨ Highlights

| Feature | What it does |
| --- | --- |
| 📅 **Install-date sorting** | Newest first or oldest first. Extensions without a usable date always go last, never on top. |
| 🔤 **Name sorting** | A-Z and Z-A, case insensitive, numbers in names sorted naturally. |
| 🎨 **Theme filter** | Show only theme extensions, or everything that is *not* a theme. |
| 🔎 **Search** | Matches display name, publisher and extension id. Several words must all match. |
| 📂 **One click to the real page** | Opens VS Code's native extension details page (README, Changelog, Set Color Theme, Disable, Uninstall…). If a future build drops that command, the built-in Extensions view is opened filtered by `@id:` instead. |
| 🧾 **Copy id, open Marketplace** | Both from the row context menu. |
| 💾 **Remembers your order** | The order you pick in the view title bar is stored per profile and survives a restart. |
| 🕓 **Install history** | "First seen" records are kept, so uninstalling something does not erase when you first got it. |
| 📌 **Built-ins are opt-in** | The extensions that ship inside VS Code stay hidden until you ask for them. |
| 🔒 **Local only** | No telemetry, no network requests, no workspace code is executed. |

---

## 🚀 Install

**From the Marketplace** — search for *Extension Sorter* in the Extensions view, or use the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=lilinhuang.extension-sorter).

**From a VSIX**

```powershell
code --install-extension extension-sorter-1.0.0.vsix
```

**From source**

```powershell
git clone https://github.com/vaxicy/extension-sorter.git
cd extension-sorter
npm install
npm run compile
```

Then press `F5` (Run Extension) to start an Extension Development Host, or `npm run vsix` to build an installable package.

Requires VS Code **1.80** or newer.

---

## 🧭 Usage

1. Click the **Extension Sorter** icon in the activity bar and open the **Installed by Date** view.
2. Use the buttons in the view title bar:
   - **Sort Installed Extensions By…** — Newest installed first, Oldest installed first, Name A-Z, Name Z-A
   - **Filter Installed Extensions…** — All extensions, Themes only, Non-theme extensions (each entry shows how many extensions it would leave)
   - **Search Installed Extensions…** — name, publisher and id are searched
   - **Refresh Installed Extensions**
3. Every row shows `publisher · date · source`, for example `contoso · Oct 9, 2026 · Estimated`. Hover it for the full picture: id, version, theme count, folder path and a sentence that explains how trustworthy the date is.
4. **Click a row** to open the native details page. Right-click for **Open Extension Details**, **Copy Extension ID** and **Open in Marketplace** (the last one for theme and extension rows).
5. The view header shows what you are looking at (`98 extensions · Newest first`, or `12 of 98 · Themes only + search "lilac"` while a filter is active), so a forgotten filter cannot silently hide extensions.

Everything is also reachable from the command palette under `Extension Sorter:` — sort, filter, search, refresh and **Reset Filters and Search** (also offered directly in the view when the filter leaves nothing to show).

---

## 📅 Where the install date comes from

VS Code does not expose a public API for the install time, so Extension Sorter walks a chain and always tells you which step produced the date. The label next to the date is the honest answer to "can I trust this?".

| Label | Source | Meaning |
| --- | --- | --- |
| **Installed** | `__metadata.installedTimestamp`, written by VS Code when it installed the extension | Exact install time of this version |
| **Installed** | The extension appeared while Extension Sorter was running and its folder was created moments ago | Observed install |
| **Estimated** | Creation time of the extension folder (falling back to its change time) | A good guess: the folder is created at install time, but it is not an official record |
| **First seen** | The first time Extension Sorter ever saw the extension | An observation, **not** the install time |
| **Unknown** | Folder unreadable, no observation | No usable date; the in-view tooltip says so |

Dates from VS Code's own records survive everything. Estimated and observed dates are remembered in the install history (`globalState`), which also keeps first-seen records for extensions that are no longer installed — so a removed extension does not silently lose its date. Records older than `extensionSorter.installHistoryRetentionDays` are dropped (180 days by default, at most 2000 entries are kept).

---

## 🧩 Settings

| Setting | Default | Description |
| --- | --- | --- |
| `extensionSorter.defaultSortOrder` | `newest` | Order used the first time the **Installed by Date** view is opened (`newest`, `oldest`, `nameAsc`, `nameDesc`). Changing the order from the view title bar stores a per-profile preference that overrides this setting. |
| `extensionSorter.includeBuiltInExtensions` | `false` | Show the extensions that ship inside the VS Code installation. |
| `extensionSorter.installHistoryRetentionDays` | `180` | How long first-seen records for extensions that are no longer installed are kept (1–3650). |

---

## 🔧 Commands

| Command | Title | Where |
| --- | --- | --- |
| `extensionSorter.sort` | Sort Installed Extensions By… | View title bar, command palette |
| `extensionSorter.filter` | Filter Installed Extensions… | View title bar, command palette |
| `extensionSorter.search` | Search Installed Extensions… | View title bar, command palette |
| `extensionSorter.refresh` | Refresh Installed Extensions | View title bar, command palette |
| `extensionSorter.clearFilters` | Reset Filters and Search | Command palette, empty view |
| `extensionSorter.openDetails` | Open Extension Details | Row, row context menu |
| `extensionSorter.copyId` | Copy Extension ID | Row context menu |
| `extensionSorter.openInMarketplace` | Open in Marketplace | Row context menu (theme and extension rows) |

---

## 🔒 Privacy

Extension Sorter reads the extensions that are already installed: `vscode.extensions.all`, the `package.json` of each extension, the creation time of its folder, its icon, and its own `globalState`. That is all.

- No telemetry, no analytics, no account, no network request.
- Nothing is uploaded anywhere; your extension list and your install dates stay on your machine.
- No code from your workspace is executed, so the extension works in **Restricted Mode** (untrusted workspaces) and in virtual workspaces.

---

## 🧪 Development

```powershell
npm install          # dependencies
npm run compile      # tsc -> out/
npm test             # type check + 55 unit tests
npm run test:integration   # runs inside a real VS Code, three phases
npm run vsix         # build extension-sorter-<version>.vsix (+ copy for upload)
```

`test:integration` starts your local VS Code three times with an isolated profile: `write` and `read` drive a real editor through a generated helper extension to verify that the sort order and the install history survive a restart, and `suite` runs the mocha suite that covers command registration, the view and tree rendering, the native details command and the install-date/icon resolution.

> 💡 Note about the persistence phases: VS Code keeps **all** of its storage in memory (`:memory:` SQLite) as soon as `--extensionTestsPath` is passed, so a mocha test can never observe what a previous run wrote. That is why the restart check runs as a normal editor launch instead — see `src/test/integration/stateDriver.ts`.

---

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md). The first release, 1.0.0, is the complete feature set described above.

---

## 📄 License

[MIT](LICENSE) © Li Lin Huang

- ✅ Use it, modify it, publish it, use it commercially, use it privately
- ✅ Keep the copyright notice and the license text with it
- ❌ The author provides no warranty and is not liable for any damage

Commercial use is fine under MIT — no separate permission needed.
