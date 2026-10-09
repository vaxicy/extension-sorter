# Changelog

All notable changes to the **Extension Sorter** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 - 2026-10-10

### Added

- **Installed by Date** view in the activity bar: every installed extension with its install date in one plain list.
- Sort orders: newest installed first, oldest installed first, name A-Z, name Z-A. Extensions without a usable date always go last, and names are compared naturally (so `v10` comes after `v9`).
- Filters: all extensions, themes only, non-theme extensions - with a live count of what each filter would leave.
- Search across display name, publisher and extension id; several words must all match.
- Install date resolution chain with a label per source: `__metadata.installedTimestamp` recorded by VS Code and live-observed installs are shown as **Installed**, folder creation/change times as **Estimated**, previous observations as **First seen**, and **Unknown** when nothing usable exists. The hover tooltip explains the source in a full sentence.
- Install history in `globalState`: keeps first-seen records of extensions that are no longer installed, prunes records older than `extensionSorter.installHistoryRetentionDays` (180 days by default) and caps the list at 2000 entries.
- **Open Extension Details** opens VS Code's native extension details page; when that command is unavailable, the built-in Extensions view is opened pre-filtered with `@id:` instead, together with a hint that offers opening the Marketplace page or copying the id.
- Row context menu: open details, copy extension id, open in Marketplace (theme and extension rows).
- View title bar contains sort, filter, search and refresh, and the view header reports the current selection (`98 extensions · Newest first`, `12 of 98 · Themes only + search "lilac"`).
- Settings: `extensionSorter.defaultSortOrder`, `extensionSorter.includeBuiltInExtensions`, `extensionSorter.installHistoryRetentionDays`.
- 55 unit tests plus an integration suite that runs inside a real VS Code in three phases: `write` and `read` verify with an ordinary editor launch that the sort order and the install history survive a restart, `suite` covers command registration, the view and tree rendering, the native details command and install-date/icon resolution.
- Documentation: README (English and Chinese), install instructions, usage, settings and command reference.

### Notes

- The extension only reads the local installation (extensions, their manifests, folder timestamps, icons) and its own `globalState`: no telemetry, no network access, no workspace code is executed. It supports Restricted Mode and virtual workspaces.
