import { asElement, findScroller, INTERFACE_SELECTOR, isEditable } from "./dom.ts";
import { LinkHints } from "./hints.ts";
import { ContinuousScroller } from "./scroll.ts";
import type { VimflowSettings } from "./settings.ts";

export type Mode = "normal" | "insert" | "hint";
export type WorkspaceAction =
  | "files"
  | "filesNewTab"
  | "previousTab"
  | "nextTab"
  | "closeTab"
  | "newTab"
  | "find"
  | "help"
  | "focusEditor";

export interface NavigationHost {
  settings(): VimflowSettings;
  action(action: WorkspaceAction): void;
  activate(target: HTMLElement, newTab: boolean): void;
  modeChanged(mode: Mode): void;
}

const DIRECTIONS: Record<string, readonly [number, number]> = {
  j: [0, 1],
  k: [0, -1],
  h: [-1, 0],
  l: [1, 0],
};

/** Owns one document, including focus, hint overlays, and animation cleanup. */
export class NavigationController {
  readonly scroller: ContinuousScroller;
  readonly hints: LinkHints;
  private doc: Document;
  private host: NavigationHost;
  private reducedMotion: MediaQueryList;
  private mode: Mode = "normal";
  private anchor: Element | null = null;
  private pendingG = 0;
  private teardown: (() => void)[] = [];

  constructor(doc: Document, host: NavigationHost) {
    this.doc = doc;
    this.host = host;
    const win = doc.defaultView!;
    this.reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
    this.scroller = new ContinuousScroller({
      now: () => win.performance.now(),
      request: (callback) => win.requestAnimationFrame(callback),
      cancel: (id) => win.cancelAnimationFrame(id),
    });
    this.hints = new LinkHints(
      doc,
      (target, newTab) => host.activate(target, newTab),
      (active) => {
        if (active) this.setMode("hint");
        else if (this.mode === "hint") this.setMode("normal");
      },
    );
    this.listen(doc, "keydown", this.onKeyDown, true);
    this.listen(doc, "keyup", (event) => {
      const keyboard = event as KeyboardEvent;
      this.scroller.release(keyboard.code || keyboard.key);
    });
    this.listen(
      doc,
      "pointerdown",
      (event) => {
        this.cancel();
        this.anchor = asElement(event.target);
        if (!this.anchor?.closest(INTERFACE_SELECTOR))
          this.setMode(isEditable(event.target) ? "insert" : "normal");
      },
      true,
    );
    this.listen(doc, "focusin", (event) => {
      if (asElement(event.target)?.closest(INTERFACE_SELECTOR)) {
        this.cancel();
        return;
      }
      if (isEditable(event.target)) {
        this.cancel();
        this.setMode("insert");
      }
    });
    this.listen(doc, "wheel", () => this.cancel(), { passive: true });
    this.listen(doc, "scroll", () => this.hints.clear(), true);
    this.listen(doc, "visibilitychange", () => {
      if (doc.hidden) this.cancel();
    });
    this.listen(win, "blur", () => this.cancel());
    this.listen(win, "resize", () => this.hints.clear());
    this.setMode(isEditable(doc.activeElement) ? "insert" : "normal");
  }

  private listen(
    target: EventTarget,
    name: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    target.addEventListener(name, handler, options);
    this.teardown.push(() => target.removeEventListener(name, handler, options));
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.host.modeChanged(mode);
  }

  enterNormal(): void {
    this.cancel();
    const active = this.doc.activeElement as HTMLElement | null;
    if (isEditable(active)) active?.blur();
    this.setMode("normal");
  }

  showHints(newTab = false): void {
    this.scroller.stop();
    this.hints.show(this.host.settings().hintCharacters, newTab);
  }

  cancel(): void {
    this.scroller.stop();
    this.hints.clear();
    this.pendingG = 0;
  }

  resetTarget(): void {
    this.cancel();
    this.anchor = null;
    this.setMode(isEditable(this.doc.activeElement) ? "insert" : "normal");
  }

  destroy(): void {
    this.cancel();
    for (const remove of this.teardown.splice(0)) remove();
  }

  private onKeyDown = (raw: Event): void => {
    const event = raw as KeyboardEvent;
    // Stop a held scroll when an OS/application shortcut takes over (keyup may be lost).
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
      this.cancel();
      return;
    }
    const target = asElement(event.target);
    if (target?.closest(INTERFACE_SELECTOR)) {
      this.cancel();
      return;
    }
    const consume = () => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    if (this.hints.active) {
      consume();
      if (!event.repeat) this.hints.key(event.key);
      return;
    }
    if (event.key === "Escape") {
      consume();
      this.enterNormal();
      return;
    }
    if (this.mode === "insert" || isEditable(event.target)) return;

    const direction = DIRECTIONS[event.key];
    if (direction) {
      consume();
      this.pendingG = 0;
      // Resolve and measure the scroll container only once, not on every repeat or frame.
      if (!event.repeat) {
        const surface = findScroller(this.doc, this.anchor, ...direction);
        const settings = this.host.settings();
        if (surface)
          this.scroller.press(
            event.code || event.key,
            surface,
            ...direction,
            settings.scrollSpeed,
            settings.tapDistance,
          );
      }
      return;
    }

    if (event.key === "d" || event.key === "u") {
      consume();
      this.pendingG = 0;
      const direction = event.key === "d" ? 1 : -1;
      const surface = findScroller(this.doc, this.anchor, 0, direction);
      if (surface) {
        this.scroller.halfPage(surface, direction, {
          repeat: event.repeat,
          reducedMotion: this.reducedMotion.matches,
        });
      } else this.scroller.stop();
      return;
    }

    const supported = [
      "g",
      "G",
      "f",
      "F",
      "i",
      "o",
      "O",
      "J",
      "K",
      "x",
      "t",
      "/",
      "?",
      "PageDown",
      "PageUp",
    ];
    if (!supported.includes(event.key)) {
      this.pendingG = 0;
      return;
    }
    consume();
    if (event.repeat && !["PageDown", "PageUp"].includes(event.key)) return;
    this.scroller.stop();
    if (["g", "G", "PageDown", "PageUp"].includes(event.key)) {
      const surface = findScroller(this.doc, this.anchor, 0, 1);
      if (!surface) return;
      const now = this.doc.defaultView!.performance.now();
      if (event.key === "g") {
        if (this.pendingG && now - this.pendingG < 700) {
          surface.scrollTo({ top: 0, behavior: "instant" });
          this.pendingG = 0;
        } else this.pendingG = now;
        return;
      }
      this.pendingG = 0;
      if (event.key === "G") surface.scrollTo({ top: surface.scrollHeight, behavior: "instant" });
      else {
        const sign = event.key === "PageDown" ? 1 : -1;
        surface.scrollBy({ top: sign * surface.clientHeight * 0.9, behavior: "instant" });
      }
      return;
    }
    this.pendingG = 0;
    if (event.key === "f" || event.key === "F") this.showHints(event.key === "F");
    else if (event.key === "i") {
      this.setMode("insert");
      this.host.action("focusEditor");
    } else {
      const actions: Record<string, WorkspaceAction> = {
        o: "files",
        O: "filesNewTab",
        J: "previousTab",
        K: "nextTab",
        x: "closeTab",
        t: "newTab",
        "/": "find",
        "?": "help",
      };
      const action = actions[event.key];
      if (action) this.host.action(action);
    }
  };
}
