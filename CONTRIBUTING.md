# 开发与贡献

需要 Node.js 24 或更新版本，以及 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
```

`pnpm check` 执行格式检查、Obsidian 官方 ESLint 检查、单元测试、类型检查、生产构建和无界面 Chromium 测试。Linux 上首次准备浏览器时使用 `pnpm exec playwright install --with-deps chromium`。

开发时运行 `pnpm dev`，将构建后的 `main.js` 与根目录的 `manifest.json`、`styles.css` 放入测试仓库的插件目录；重新加载插件后生效。使用独立测试仓库调试。

## 模块职责

- `src/scroll.ts`：逐帧连续滚动和短按距离，时钟可替换以测试不同刷新频率。
- `src/dom.ts`：输入区域识别和滚动容器选择。
- `src/hints.ts`：定位字母分配、可见目标筛选、提示层与激活选择。
- `src/navigation.ts`：单个窗口的按键、模式及生命周期。
- `src/main.ts`：Obsidian 插件、文件选择、工作区动作和设置。

滚动逻辑的修改需要保留以下行为：系统首次重复按键前持续移动；重复按键不增加动画；长按松键后停止；短按距离可累加；失焦和卸载立即清理。用单元测试验证运动轨迹，用浏览器测试验证实际 DOM 与键盘行为。

## 发布

版本号同时记录在 `package.json`、`manifest.json`、`versions.json`。更新后执行 `pnpm check`，提交修改，并推送与版本号完全一致的标签，例如 `0.1.0`。GitHub Actions 会验证版本、测试和构建，并在 Release 中附上 `main.js`、`manifest.json`、`styles.css`。

问题报告请包含 Obsidian 版本、操作系统、插件版本、视图类型，以及能复现问题的操作。提交时排除个人笔记和账户信息。
