export const INTERFACE_SELECTOR = [
  ".modal-container",
  ".menu",
  ".popover",
  ".suggestion-container",
  ".prompt",
  ".document-search-container",
  ".mod-settings",
  "[role='dialog']",
  "[role='menu']",
].join(",");

export function asElement(target: EventTarget | null): Element | null {
  return target && "nodeType" in target && target.nodeType === 1 ? (target as Element) : null;
}

export function isEditable(target: EventTarget | null): boolean {
  return Boolean(
    asElement(target)?.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
    ),
  );
}

export function isVisible(element: HTMLElement): boolean {
  const win = element.ownerDocument.defaultView;
  if (!win || !element.isConnected || element.closest("[inert], [aria-hidden='true']"))
    return false;
  const rect = element.getBoundingClientRect();
  const style = win.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < win.innerHeight &&
    rect.left < win.innerWidth &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

/** Exclude targets clipped by a pane or covered by another interface layer. */
export function isHintVisible(element: HTMLElement): boolean {
  if (!isVisible(element)) return false;
  const doc = element.ownerDocument;
  const win = doc.defaultView!;
  const rect = element.getBoundingClientRect();
  let left = Math.max(0, rect.left);
  let right = Math.min(win.innerWidth, rect.right);
  let top = Math.max(0, rect.top);
  let bottom = Math.min(win.innerHeight, rect.bottom);
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = win.getComputedStyle(parent);
    const bounds = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
  }
  if (right <= left || bottom <= top) return false;
  const hit = doc.elementFromPoint((left + right) / 2, (top + bottom) / 2);
  return hit === element || Boolean(hit && element.contains(hit));
}

function canScroll(element: HTMLElement, dx: number, dy: number): boolean {
  const win = element.ownerDocument.defaultView;
  if (!win || !isVisible(element)) return false;
  const style = win.getComputedStyle(element);
  if (dx && /(auto|scroll|overlay)/.test(style.overflowX))
    return element.scrollWidth > element.clientWidth + 1;
  if (dy && /(auto|scroll|overlay)/.test(style.overflowY))
    return element.scrollHeight > element.clientHeight + 1;
  return false;
}

/** Pointer-selected panes win; scrolling stays inside the selected pane at its boundary. */
export function findScroller(
  doc: Document,
  anchor: Element | null,
  dx: number,
  dy: number,
): HTMLElement | null {
  if (anchor?.isConnected) {
    for (
      let element: Element | null = anchor;
      element && element !== doc.body;
      element = element.parentElement
    ) {
      if (canScroll(element as HTMLElement, dx, dy)) return element as HTMLElement;
    }
  }
  const pane =
    anchor?.closest(
      ".workspace-leaf, .workspace-split.mod-left-split, .workspace-split.mod-right-split",
    ) ??
    doc.querySelector(".workspace-leaf.mod-active") ??
    doc.body;
  const candidates = Array.from(
    pane.querySelectorAll<HTMLElement>(
      ".markdown-preview-view, .cm-scroller, .view-content, .nav-files-container, .search-result-container, .canvas-wrapper",
    ),
  ).filter((element) => canScroll(element, dx, dy));
  candidates.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
  if (candidates[0]) return candidates[0];
  const fallback = doc.scrollingElement as HTMLElement | null;
  return fallback && canScroll(fallback, dx, dy) ? fallback : null;
}
