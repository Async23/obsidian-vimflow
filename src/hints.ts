import { isHintVisible } from "./dom.ts";
import { normalizeAlphabet } from "./settings.ts";

export function makeLabels(count: number, alphabet: string): string[] {
  const chars = normalizeAlphabet(alphabet);
  let width = 1;
  while (chars.length ** width < count) width += 1;
  return Array.from({ length: count }, (_, index) => {
    let value = index;
    let label = "";
    for (let digit = 0; digit < width; digit += 1) {
      label = chars[value % chars.length] + label;
      value = Math.floor(value / chars.length);
    }
    return label;
  });
}

interface Hint {
  label: string;
  target: HTMLElement;
  chip: HTMLElement;
}

const TARGET_SELECTOR = [
  "a[href]",
  "a[data-href]",
  "button",
  "[role='button']",
  ".clickable-icon",
  ".nav-file-title",
  ".nav-folder-title",
  ".workspace-tab-header",
].join(",");

export class LinkHints {
  private doc: Document;
  private layer?: HTMLElement;
  private hints: Hint[] = [];
  private prefix = "";
  private newTab = false;
  private activate: (target: HTMLElement, newTab: boolean) => void;
  private update: (active: boolean) => void;

  constructor(
    doc: Document,
    activate: (target: HTMLElement, newTab: boolean) => void,
    update: (active: boolean) => void,
  ) {
    this.doc = doc;
    this.activate = activate;
    this.update = update;
  }

  get active(): boolean {
    return this.layer !== undefined;
  }

  show(alphabet: string, newTab: boolean): void {
    this.clear();
    const win = this.doc.defaultView;
    if (!win) return;
    const targets = Array.from(this.doc.querySelectorAll<HTMLElement>(TARGET_SELECTOR)).filter(
      (element) =>
        !element.closest(".vimflow-hints, [disabled], [aria-disabled='true']") &&
        isHintVisible(element),
    );
    if (!targets.length) return;
    const layer = this.doc.createElement("div");
    layer.className = "vimflow-hints";
    layer.setAttribute("aria-hidden", "true");
    this.doc.body.append(layer);
    this.layer = layer;
    this.newTab = newTab;
    const labels = makeLabels(targets.length, alphabet);
    const occupied: DOMRect[] = [];
    this.hints = targets.map((target, index) => {
      const label = labels[index]!;
      const chip = this.doc.createElement("span");
      chip.className = "vimflow-hint";
      chip.textContent = label;
      layer.append(chip);
      const targetRect = target.getBoundingClientRect();
      const width = chip.offsetWidth;
      const height = chip.offsetHeight;
      const left = Math.max(4, Math.min(targetRect.left, win.innerWidth - width - 4));
      let top = Math.max(4, Math.min(targetRect.top, win.innerHeight - height - 4));
      // Shift adjacent labels rather than drawing unreadable labels over each other.
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const overlap = occupied.find(
          (rect) =>
            left < rect.right + 2 &&
            left + width + 2 > rect.left &&
            top < rect.bottom + 2 &&
            top + height + 2 > rect.top,
        );
        if (!overlap) break;
        const next = overlap.bottom + 3;
        top = next + height < win.innerHeight - 4 ? next : Math.max(4, overlap.top - height - 3);
      }
      chip.style.left = `${left}px`;
      chip.style.top = `${top}px`;
      occupied.push(chip.getBoundingClientRect());
      return { label, target, chip };
    });
    this.update(true);
  }

  key(key: string): void {
    if (key === "Escape") {
      this.clear();
      return;
    }
    if (key === "Backspace") this.prefix = this.prefix.slice(0, -1);
    else if (key.length === 1) this.prefix += key.toLowerCase();
    else return;
    const matches = this.hints.filter((hint) => hint.label.startsWith(this.prefix));
    const exact = matches.find((hint) => hint.label === this.prefix);
    if (exact) {
      const { target } = exact;
      const newTab = this.newTab;
      this.clear();
      if (target.isConnected && isHintVisible(target)) this.activate(target, newTab);
      return;
    }
    if (!matches.length) {
      this.clear();
      return;
    }
    for (const hint of this.hints) {
      hint.chip.hidden = !hint.label.startsWith(this.prefix);
      hint.chip.textContent = hint.label.slice(this.prefix.length);
    }
  }

  clear(): void {
    this.layer?.remove();
    this.layer = undefined;
    this.hints = [];
    this.prefix = "";
    this.update(false);
  }
}
