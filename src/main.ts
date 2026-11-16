import {
  App,
  FuzzySuggestModal,
  MarkdownView,
  Modal,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  getLanguage,
} from "obsidian";
import type { SettingDefinitionItem, TFile, WorkspaceLeaf } from "obsidian";
import { NavigationController } from "./navigation.ts";
import type { Mode, WorkspaceAction } from "./navigation.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.ts";
import type { VimflowSettings } from "./settings.ts";

const text = (en: string, zh: string): string => (getLanguage().startsWith("zh") ? zh : en);

export default class VimflowPlugin extends Plugin {
  settings: VimflowSettings = normalizeSettings(undefined);
  private controllers = new Map<Document, NavigationController>();
  private status?: HTMLElement;
  private currentMode: Mode = "normal";
  private disposed = false;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new VimflowSettingsTab(this.app, this));
    this.status = this.addStatusBarItem();
    this.status.classList.add("vimflow-status");
    this.addCommand({
      id: "normal-mode",
      name: text("Enter normal mode", "进入普通模式"),
      callback: () => this.activeController()?.enterNormal(),
    });
    this.addCommand({
      id: "link-hints",
      name: text("Show link hints", "显示定位提示"),
      callback: () => this.activeController()?.showHints(),
    });
    this.addCommand({
      id: "help",
      name: text("Show keyboard shortcuts", "显示快捷键"),
      callback: () => this.showHelp(),
    });
    this.registerEvent(
      this.app.workspace.on("window-open", (_workspaceWindow, win) => this.attach(win.document)),
    );
    this.registerEvent(
      this.app.workspace.on("window-close", (_workspaceWindow, win) => {
        this.controllers.get(win.document)?.destroy();
        this.controllers.delete(win.document);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        for (const controller of this.controllers.values()) controller.resetTarget();
      }),
    );
    this.app.workspace.onLayoutReady(() => {
      if (this.disposed) return;
      this.attach(this.app.workspace.containerEl.ownerDocument);
      this.app.workspace.iterateAllLeaves((leaf) =>
        this.attach(leaf.view.containerEl.ownerDocument),
      );
    });
  }

  onunload(): void {
    this.disposed = true;
    for (const controller of this.controllers.values()) controller.destroy();
    this.controllers.clear();
  }

  private attach(doc: Document): void {
    if (this.controllers.has(doc) || !doc.defaultView) return;
    const controller = new NavigationController(doc, {
      settings: () => this.settings,
      action: (action) => this.runAction(action),
      activate: (target, newTab) => this.activate(target, newTab),
      modeChanged: (mode) => this.updateStatus(mode),
    });
    this.controllers.set(doc, controller);
  }

  private activeController(): NavigationController | undefined {
    return this.controllers.get(activeDocument);
  }

  updateStatus(mode?: Mode): void {
    if (mode) this.currentMode = mode;
    if (!this.status) return;
    this.status.hidden = !this.settings.showModeIndicator;
    this.status.setText(`Vimflow · ${this.currentMode.toUpperCase()}`);
  }

  private runAction(action: WorkspaceAction): void {
    switch (action) {
      case "files":
      case "filesNewTab":
        new NotePicker(this.app, action === "filesNewTab", () =>
          this.activeController()?.enterNormal(),
        ).open();
        break;
      case "previousTab":
        this.cycleTab(-1);
        break;
      case "nextTab":
        this.cycleTab(1);
        break;
      case "closeTab":
        this.app.workspace.getMostRecentLeaf()?.detach();
        break;
      case "newTab":
        this.app.workspace.setActiveLeaf(this.app.workspace.getLeaf("tab"), { focus: true });
        break;
      case "focusEditor":
        void this.focusEditor().catch((error: unknown) => {
          new Notice(text("Could not focus the editor.", "无法进入编辑视图。"));
          console.error("Vimflow: failed to focus editor", error);
        });
        break;
      case "find": {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const searchButton = view?.containerEl.querySelector<HTMLElement>(
          ".document-search-container input",
        );
        if (searchButton) searchButton.focus();
        else {
          // Obsidian exposes its built-in search through the command registry, outside the public SDK.
          const commands = (
            this.app as App & { commands?: { executeCommandById(id: string): boolean } }
          ).commands;
          if (!commands?.executeCommandById("editor:open-search"))
            new Notice(
              text(
                "Use the Find command to search this view.",
                "请使用 Obsidian 的查找命令搜索当前视图。",
              ),
            );
        }
        break;
      }
      case "help":
        this.showHelp();
        break;
    }
  }

  private async focusEditor(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    if (view.getMode() === "preview")
      await view.setState({ ...view.getState(), mode: "source" }, { history: false });
    view.editor.focus();
  }

  private cycleTab(direction: -1 | 1): void {
    const active = this.app.workspace.getMostRecentLeaf();
    if (!active) return;
    const leaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.parent === active.parent) leaves.push(leaf);
    });
    const index = leaves.indexOf(active);
    const next = leaves[(index + direction + leaves.length) % leaves.length];
    if (next) this.app.workspace.setActiveLeaf(next, { focus: true });
  }

  private activate(target: HTMLElement, newTab: boolean): void {
    const link = target.closest<HTMLAnchorElement>("a.internal-link, a[data-href]");
    const href = link?.getAttribute("data-href") ?? link?.getAttribute("href");
    if (href && !/^[a-z][a-z\d+.-]*:/i.test(href)) {
      void this.app.workspace
        .openLinkText(href, this.app.workspace.getActiveFile()?.path ?? "", newTab ? "tab" : false)
        .catch((error: unknown) => {
          new Notice(
            text(
              "Could not open link. See the developer console.",
              "链接打开失败，请查看开发者控制台。",
            ),
          );
          console.error("Vimflow: failed to open link", error);
        });
    } else if (newTab && target.matches("a[href]")) {
      const win = target.ownerDocument.defaultView!;
      target.dispatchEvent(
        new win.MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ctrlKey: !Platform.isMacOS,
          metaKey: Platform.isMacOS,
        }),
      );
    } else target.click();
  }

  private showHelp(): void {
    const modal = new Modal(this.app);
    modal.titleEl.setText("Vimflow");
    modal.contentEl.classList.add("vimflow-help");
    const entries = [
      ["j / k / h / l", text("Scroll; hold for continuous motion", "滚动；长按持续移动")],
      ["gg / G", text("Top / bottom", "顶部 / 底部")],
      ["d / u", text("Half page down / up", "下滚 / 上滚半页")],
      [
        "f / F",
        text("Follow a hint / open a note in a new tab", "定位并打开 / 在新标签页打开笔记"),
      ],
      ["o / O", text("Find a note / open in a new tab", "搜索笔记 / 在新标签页打开")],
      [
        "J / K",
        text("Previous / next tab in the current group", "当前分组的上一个 / 下一个标签页"),
      ],
      ["t / x", text("New / close tab", "新建 / 关闭标签页")],
      ["i / Esc", text("Edit / return to navigation", "编辑 / 回到导航")],
      ["/", text("Find in the current note", "在当前笔记中查找")],
      ["?", text("Show this reference", "显示快捷键")],
    ];
    const list = modal.contentEl.createEl("dl");
    for (const [keys, description] of entries) {
      list.createEl("dt", { text: keys });
      list.createEl("dd", { text: description });
    }
    modal.open();
  }
}

class NotePicker extends FuzzySuggestModal<TFile> {
  private newTab: boolean;
  private afterOpen: () => void;

  constructor(app: App, newTab: boolean, afterOpen: () => void) {
    super(app);
    this.newTab = newTab;
    this.afterOpen = afterOpen;
    this.setPlaceholder(text("Find a note…", "搜索笔记…"));
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }
  getItemText(file: TFile): string {
    return file.path.replace(/\.md$/, "");
  }
  onChooseItem(file: TFile): void {
    void this.app.workspace
      .getLeaf(this.newTab ? "tab" : false)
      .openFile(file)
      .then(this.afterOpen)
      .catch((error: unknown) => {
        new Notice(text("Could not open note.", "笔记打开失败。"));
        console.error("Vimflow: failed to open note", error);
      });
  }
}

class VimflowSettingsTab extends PluginSettingTab {
  private vimflow: VimflowPlugin;

  constructor(app: App, plugin: VimflowPlugin) {
    super(app, plugin);
    this.vimflow = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem<keyof VimflowSettings>[] {
    return [
      {
        name: text("Scroll speed", "连续滚动速度"),
        desc: text(
          "Pixels per second while a navigation key is held.",
          "按住方向键时每秒移动的像素数。",
        ),
        control: {
          type: "slider",
          key: "scrollSpeed",
          min: 100,
          max: 3000,
          step: 50,
          defaultValue: DEFAULT_SETTINGS.scrollSpeed,
        },
      },
      {
        name: text("Tap distance", "短按滚动距离"),
        desc: text(
          "Minimum distance for a quick tap, in pixels.",
          "轻按一次方向键的最小移动距离，单位为像素。",
        ),
        control: {
          type: "slider",
          key: "tapDistance",
          min: 16,
          max: 300,
          step: 4,
          defaultValue: DEFAULT_SETTINGS.tapDistance,
        },
      },
      {
        name: text("Hint characters", "定位字符"),
        desc: text("At least two distinct letters (a–z).", "至少两个不同的英文字母（a–z）。"),
        control: {
          type: "text",
          key: "hintCharacters",
          defaultValue: DEFAULT_SETTINGS.hintCharacters,
          validate: (value) => {
            if (!/^[a-z]+$/i.test(value) || new Set(value.toLowerCase()).size < 2)
              return text(
                "Enter at least two distinct letters (a–z).",
                "请输入至少两个不同的英文字母（a–z）。",
              );
          },
        },
      },
      {
        name: text("Show mode in status bar", "在状态栏显示模式"),
        control: {
          type: "toggle",
          key: "showModeIndicator",
          defaultValue: DEFAULT_SETTINGS.showModeIndicator,
        },
      },
    ];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (!Object.hasOwn(this.vimflow.settings, key)) return;
    this.vimflow.settings = normalizeSettings({ ...this.vimflow.settings, [key]: value });
    this.vimflow.updateStatus();
    await this.vimflow.saveData(this.vimflow.settings);
  }
}
