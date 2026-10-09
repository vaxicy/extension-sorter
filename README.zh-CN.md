<div align="center">
  <img src="https://raw.githubusercontent.com/vaxicy/extension-sorter/master/resources/icon.png" alt="Extension Sorter 图标" width="96">
  <h1 align="center">Extension Sorter</h1>
  <p>按你当初安装的顺序看已装扩展，一键打开真正的扩展详情页。</p>
  <p>
    <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="版本 1.0.0">
    <img src="https://img.shields.io/badge/license-Non--Commercial-red" alt="许可证 非商业使用">
    <a href="https://marketplace.visualstudio.com/items?itemName=lilinhuang.extension-sorter"><img src="https://img.shields.io/badge/VS%20Code-Extension-1F6FEB?logo=visual-studio-code&amp;logoColor=white" alt="VS Code 扩展"></a>
    <a href="https://github.com/vaxicy/extension-sorter"><img src="https://img.shields.io/badge/GitHub-Repository-181717?logo=github&amp;logoColor=white" alt="GitHub"></a>
  </p>
</div>

[English](README.md) | **简体中文**

VS Code 内置的扩展视图其实能按安装日期排序，但主题、工具、语言包全混在一个长列表里，想看看「上周装了什么」并没有顺手的位置。Extension Sorter 就在它旁边加了一个专门回答这个问题的视图：干净的一列，按安装时间从新到旧排好，日期从哪来也一并写在每行上。

**目录**

- [✨ 功能一览](#-功能一览)
- [🚀 安装](#-安装)
- [🧭 怎么用](#-怎么用)
- [📅 安装日期是怎么来的](#-安装日期是怎么来的)
- [🧩 设置项](#-设置项)
- [🔧 命令](#-命令)
- [🔒 隐私](#-隐私)
- [🧪 开发与测试](#-开发与测试)
- [📝 更新日志](#-更新日志)
- [📄 许可证](#-许可证)

---

## ✨ 功能一览

| 功能 | 说明 |
| --- | --- |
| 📅 **按安装日期排序** | 新装的在前，或最旧的在前。拿不到日期的扩展永远排在最后，不会跑到最上面装作今天装的。 |
| 🔤 **按名称排序** | A-Z 与 Z-A，忽略大小写，名字里的数字按数值比较（`v10` 排在 `v9` 后面）。 |
| 🎨 **主题筛选** | 只看主题扩展，或者看除主题之外的其它扩展。 |
| 🔎 **搜索** | 显示名、发布者、扩展 ID 都能搜；输入多个词时必须全部命中。 |
| 📂 **一键到官方页面** | 打开 VS Code 原生的扩展详情页（README、Changelog、设置配色主题、禁用、卸载都在那），命令哪天不可用了就退回到内置扩展视图的 `@id:` 过滤结果。 |
| 🧾 **复制 ID、跳商店** | 右键菜单里两条都在，不用再翻扩展视图。 |
| 💾 **记得你的选择** | 在视图标题栏选的顺序会按配置文件保存，重启 VS Code 依然生效。 |
| 🕓 **安装历史** | 保留「首次见到」的记录，卸载扩展也不会连带抹掉你最早什么时候装的它。 |
| 📌 **内置扩展默认不出现** | VS Code 自带的那一堆默认隐藏，想看时一个开关就能放出来。 |
| 🔒 **纯本地** | 不收集遥测、不联网、不执行你工作区里的任何代码。 |

---

## 🚀 安装

**从商店安装**：在扩展视图里搜 *Extension Sorter*，或直接打开[商店页面](https://marketplace.visualstudio.com/items?itemName=lilinhuang.extension-sorter)。

**用 VSIX 安装**

```powershell
code --install-extension extension-sorter-1.0.0.vsix
```

**从源码安装**

```powershell
git clone https://github.com/vaxicy/extension-sorter.git
cd extension-sorter
npm install
npm run compile
```

之后按 `F5` 会启动扩展开发宿主；想打一个能直接安装的包就用 `npm run vsix`。

需要 VS Code **1.80** 及以上版本。

---

## 🧭 怎么用

1. 点活动栏里的 **Extension Sorter** 图标，打开 **Installed by Date** 视图。
2. 视图标题栏的四个按钮分别对应：
   - **Sort Installed Extensions By…**：新装在前（Newest installed first）、最旧在前（Oldest installed first）、名称 A-Z、名称 Z-A
   - **Filter Installed Extensions…**：全部扩展、只看主题、除主题之外（每一项后面会写明按此项筛选后还剩多少个）
   - **Search Installed Extensions…**：搜索显示名、发布者和扩展 ID
   - **Refresh Installed Extensions**：重新扫描
3. 每行形如 `发布者 · Oct 9, 2026 · Estimated`，鼠标悬停可以看到扩展 ID、版本、贡献了几个配色主题、文件夹路径，以及一句说明日期到底有多可信。
4. **点一下行**就打开官方详情页；**右键**可以用「打开扩展详情 / 复制扩展 ID / 在商店中打开」（后两条对主题与扩展行都可用）。
5. 视图标题上一直写着当前状态（`98 extensions · Newest first`，筛选或搜索生效时是 `12 of 98 · Themes only + search "lilac"`），避免某个忘掉的筛选条件悄悄把扩展藏起来。

这些命令在命令面板里都在 `Extension Sorter:` 前缀下，其中 **Reset Filters and Search** 在整个列表被筛空时也会直接出现在视图里。

---

## 📅 安装日期是怎么来的

VS Code 没有开放查询安装时间的 API，所以 Extension Sorter 会顺着一条链路往下找，并且把「日期来自哪一步」明确写在日期旁边 —— 旁边那个标签就是「这条日期能不能信」的答案。

| 标签 | 来源 | 含义 |
| --- | --- | --- |
| **Installed** | VS Code 安装时写下的 `__metadata.installedTimestamp` | 这个版本的准确安装时间 |
| **Installed** | 扩展在 Extension Sorter 运行期间出现，且文件夹刚刚创建 | 实时观察到的安装 |
| **Estimated** | 扩展文件夹的创建时间（创建时间不可用时退回修改时间） | 大致准确：文件夹是安装时创建的，但它不是官方记录 |
| **First seen** | Extension Sorter 第一次看到这个扩展的时间 | 只是一次观察，**不是**安装时间 |
| **Unknown** | 文件夹读不到，也没有观察记录 | 无可用日期，悬停提示里会写明原因 |

VS Code 自己记录的时间最可靠，也最耐久；估算值和观察值会被记进安装历史（存在 `globalState`），卸载后仍然保留「首次见到」的记录，所以删掉一个扩展并不会顺手删掉它的日期。超过 `extensionSorter.installHistoryRetentionDays` 的记录会被清理（默认 180 天，最多保留 2000 条）。

---

## 🧩 设置项

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `extensionSorter.defaultSortOrder` | `newest` | 第一次打开 **Installed by Date** 时用的顺序（`newest`、`oldest`、`nameAsc`、`nameDesc`）。在视图标题栏改过顺序之后，存下来的个人偏好会覆盖这个设置。 |
| `extensionSorter.includeBuiltInExtensions` | `false` | 是否显示 VS Code 自带的内置扩展。 |
| `extensionSorter.installHistoryRetentionDays` | `180` | 已卸载扩展的「首次见到」记录保留多少天（1–3650）。 |

---

## 🔧 命令

| 命令 | 标题 | 出现位置 |
| --- | --- | --- |
| `extensionSorter.sort` | Sort Installed Extensions By… | 视图标题栏、命令面板 |
| `extensionSorter.filter` | Filter Installed Extensions… | 视图标题栏、命令面板 |
| `extensionSorter.search` | Search Installed Extensions… | 视图标题栏、命令面板 |
| `extensionSorter.refresh` | Refresh Installed Extensions | 视图标题栏、命令面板 |
| `extensionSorter.clearFilters` | Reset Filters and Search | 命令面板、列表为空时的视图 |
| `extensionSorter.openDetails` | Open Extension Details | 行、行右键菜单 |
| `extensionSorter.copyId` | Copy Extension ID | 行右键菜单 |
| `extensionSorter.openInMarketplace` | Open in Marketplace | 行右键菜单（主题与扩展行） |

---

## 🔒 隐私

Extension Sorter 只读已经装在机器上的东西：`vscode.extensions.all`、每个扩展的 `package.json`、它所在文件夹的创建时间、它的图标，以及它自己的 `globalState`。就这些。

- 没有遥测、没有统计、没有账号、不发任何网络请求。
- 你的扩展清单和安装日期不会离开这台机器。
- 不执行你工作区里的代码，所以在**受限模式**（不受信任的工作区）与虚拟工作区里都能正常工作。

---

## 🧪 开发与测试

```powershell
npm install          # 安装依赖
npm run compile      # tsc 编译到 out/
npm test             # 类型检查 + 55 个单元测试
npm run test:integration   # 在真实 VS Code 里分三个阶段跑集成测试
npm run vsix         # 打包 extension-sorter-<version>.vsix（并复制一份便于上传）
```

`test:integration` 会用隔离的 profile 启动本机 VS Code 三次：`write` 与 `read` 通过一个生成的辅助扩展驱动真实编辑器，验证排序偏好与安装历史确实跨重启保留；`suite` 跑 mocha 套件，覆盖命令注册、视图与树渲染、原生详情页命令、安装日期与图标解析。

> 💡 关于持久化两个阶段的由来：只要命令行里带了 `--extensionTestsPath`，VS Code 就会把**全部**存储切到内存库（`:memory:` SQLite），所以 mocha 用例永远读不到上一次运行写下的数据。跨重启的校验因此改成普通编辑器启动 —— 细节见 `src/test/integration/stateDriver.ts`。

---

## 📝 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。1.0.0 即上面描述的全部功能。

---

## 📄 许可证

本项目使用 [非商业使用许可证 (Non-Commercial License)](LICENSE)，© vaxicy

- ✅ 个人使用、学习研究、非商业分发都可以
- ✅ 分发时保留版权声明与许可证正文
- ❌ 未经许可不得商用：出售、作为商业产品或服务的一部分、用于企业内部业务运营，都不允许
- ❌ 作者不提供任何担保，也不为由此产生的问题负责

需要商用请联系作者获取商业许可。
