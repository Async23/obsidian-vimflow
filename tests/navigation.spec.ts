import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

const bundle = await build({
  entryPoints: ["src/navigation.ts"],
  bundle: true,
  format: "iife",
  globalName: "Vimflow",
  write: false,
});
const script = bundle.outputFiles![0]!.text;
const styles = await readFile("styles.css", "utf8");

async function setup(page: Page) {
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; font: 16px sans-serif; }
    .workspace-leaf { height: 700px; width: 650px; }
    .markdown-preview-view { height: 600px; overflow: auto; scroll-behavior: smooth; }
    .content { height: 9000px; padding: 20px; }
    a, button { display: inline-block; margin: 20px; }
    .side { position: absolute; left: 700px; top: 0; height: 300px; width: 250px; overflow: auto; }
  </style></head><body>
    <div class="workspace-leaf mod-active"><div class="markdown-preview-view"><div class="content">
      <a href="#one">First link</a><button id="button">An action</button><a href="#two">Second link</a>
    </div></div></div>
    <div class="side"><div style="height:3000px">Sidebar</div></div>
    <input id="input"><div id="editor" contenteditable="true">Editor</div>
  </body></html>`);
  await page.addStyleTag({ content: styles });
  await page.addScriptTag({ content: script });
  await page.evaluate(() => {
    // Obsidian installs these DOM helpers in every app window; provide the host API in Chromium.
    for (const [method, tag] of [
      ["createDiv", "div"],
      ["createSpan", "span"],
    ]) {
      Object.defineProperty(HTMLElement.prototype, method!, {
        value(this: HTMLElement, options: { cls?: string; text?: string } = {}) {
          const child = this.ownerDocument.createElement(tag!);
          if (options.cls) child.className = options.cls;
          if (options.text) child.textContent = options.text;
          this.append(child);
          return child;
        },
      });
    }
    const env = window as unknown as {
      Vimflow: { NavigationController: new (doc: Document, host: unknown) => unknown };
      controller: unknown;
      actions: string[];
      activations: unknown[];
    };
    env.actions = [];
    env.activations = [];
    env.controller = new env.Vimflow.NavigationController(document, {
      settings: () => ({
        scrollSpeed: 900,
        tapDistance: 72,
        hintCharacters: "asdfghjkl",
        showModeIndicator: true,
      }),
      action: (action: string) => env.actions.push(action),
      activate: (target: HTMLElement, newTab: boolean) =>
        env.activations.push({ id: target.id, text: target.textContent, newTab }),
      modeChanged: () => {},
    });
  });
}

const position = (page: Page) =>
  page.locator(".markdown-preview-view").evaluate((el) => el.scrollTop);
const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

test.beforeEach(async ({ page }) => setup(page));

test("held j moves during the repeat delay and stops on release", async ({ page }) => {
  await page.keyboard.down("j");
  await pause(page, 180);
  const early = await position(page);
  expect(early).toBeGreaterThan(80);
  await pause(page, 180);
  const later = await position(page);
  expect(later - early).toBeGreaterThan(80);
  await page.keyboard.up("j");
  const released = await position(page);
  await pause(page, 150);
  expect(await position(page)).toBe(released);
});

test("repeat keydowns do not restart or multiply scrolling", async ({ page }) => {
  await page.keyboard.down("j");
  for (let index = 0; index < 8; index += 1) {
    await pause(page, 35);
    await page.keyboard.down("j");
  }
  await page.keyboard.up("j");
  const distance = await position(page);
  expect(distance).toBeGreaterThan(150);
  expect(distance).toBeLessThan(600);
});

test("a quick tap finishes its minimum distance with CSS smooth scrolling enabled", async ({
  page,
}) => {
  await page.keyboard.press("j");
  await expect.poll(() => position(page)).toBeGreaterThanOrEqual(65);
  await pause(page, 150);
  expect(await position(page)).toBeLessThanOrEqual(80);
});

test("inputs and contenteditable receive literal j; Escape returns to navigation", async ({
  page,
}) => {
  await page.locator("#input").focus();
  await page.keyboard.type("jjkk");
  await expect(page.locator("#input")).toHaveValue("jjkk");
  expect(await position(page)).toBe(0);
  await page.locator("#editor").focus();
  await page.keyboard.type("jj");
  expect(await page.locator("#editor").textContent()).toContain("jj");
  await page.keyboard.press("Escape");
  await page.keyboard.press("j");
  await expect.poll(() => position(page)).toBeGreaterThan(50);
});

test("modal inputs keep their keyboard events and normal mode survives dismissal", async ({
  page,
}) => {
  await page.evaluate(() => {
    const modal = document.createElement("div");
    modal.className = "modal-container";
    modal.innerHTML = '<input id="modal-input">';
    document.body.append(modal);
  });
  await page.locator("#modal-input").focus();
  await page.keyboard.type("j");
  await expect(page.locator("#modal-input")).toHaveValue("j");
  await page.locator(".modal-container").evaluate((el) => el.remove());
  await page.keyboard.press("j");
  await expect.poll(() => position(page)).toBeGreaterThan(50);
});

test("gg, G, and half-page keys affect the active scroller", async ({ page }) => {
  await page.keyboard.press("d");
  expect(await position(page)).toBe(300);
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  expect(await position(page)).toBe(0);
  await page.keyboard.press("G");
  expect(await position(page)).toBeGreaterThan(8000);
});

test("a clicked nested scroll surface receives j instead of the main note", async ({ page }) => {
  await page.locator(".side").click({ position: { x: 30, y: 30 } });
  await page.keyboard.press("j");
  await expect.poll(() => page.locator(".side").evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
  expect(await position(page)).toBe(0);
});

test("hints activate the chosen target and F preserves the new-tab intent", async ({ page }) => {
  await page.keyboard.press("f");
  await expect(page.locator(".vimflow-hint")).toHaveCount(3);
  await page.keyboard.press("s");
  const selected = await page.evaluate(
    () => (window as unknown as { activations: unknown[] }).activations,
  );
  expect(selected).toEqual([{ id: "button", text: "An action", newTab: false }]);
  await expect(page.locator(".vimflow-hints")).toHaveCount(0);
  await page.keyboard.press("F");
  await page.keyboard.press("a");
  const next = await page.evaluate(
    () => (window as unknown as { activations: { newTab: boolean }[] }).activations,
  );
  expect(next[1]?.newTab).toBe(true);
});

test("hint labels fit inside the viewport with readable padding", async ({ page }) => {
  await page.keyboard.press("f");
  const boxes = await page.locator(".vimflow-hint").evaluateAll((labels) =>
    labels.map((label) => {
      const rect = label.getBoundingClientRect();
      const el = label as HTMLElement;
      return {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: el.clientWidth,
        textWidth: el.scrollWidth,
      };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(1100);
    expect(box.bottom).toBeLessThanOrEqual(800);
    expect(box.textWidth).toBeLessThanOrEqual(box.width);
  }
});

test("blur, modifiers and plugin disposal cancel held motion", async ({ page }) => {
  for (const stop of ["blur", "modifier", "destroy"]) {
    await page.keyboard.down("j");
    await pause(page, 120);
    if (stop === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else if (stop === "modifier") await page.keyboard.down("Control");
    else
      await page.evaluate(() =>
        (window as unknown as { controller: { destroy(): void } }).controller.destroy(),
      );
    const stopped = await position(page);
    await pause(page, 100);
    expect(await position(page)).toBe(stopped);
    await page.keyboard.up("j");
    await page.keyboard.up("Control");
  }
});

test("releasing a direction after Shift changes still stops the physical key", async ({ page }) => {
  await page.keyboard.down("j");
  await pause(page, 150);
  await page.keyboard.down("Shift");
  await page.keyboard.up("j");
  await page.keyboard.up("Shift");
  const stopped = await position(page);
  await pause(page, 100);
  expect(await position(page)).toBe(stopped);
});

test("hints exclude clipped and covered targets", async ({ page }) => {
  await page.evaluate(() => {
    const container = document.createElement("div");
    container.style.cssText =
      "position:absolute;left:700px;top:400px;height:40px;width:200px;overflow:hidden";
    container.innerHTML = '<button style="margin-top:80px">Clipped</button>';
    document.body.append(container);
    const cover = document.createElement("div");
    cover.style.cssText = "position:absolute;left:0;top:0;width:650px;height:200px;z-index:100";
    document.body.append(cover);
  });
  await page.keyboard.press("f");
  await expect(page.locator(".vimflow-hint")).toHaveCount(0);
});

test("a workspace change discards the old pointer-selected scroll target", async ({ page }) => {
  await page.locator(".side").click({ position: { x: 30, y: 30 } });
  await page.evaluate(() =>
    (window as unknown as { controller: { resetTarget(): void } }).controller.resetTarget(),
  );
  await page.keyboard.press("j");
  await expect.poll(() => position(page)).toBeGreaterThan(50);
  expect(await page.locator(".side").evaluate((el) => el.scrollTop)).toBe(0);
});

test("i requests editor focus and workspace shortcuts dispatch once", async ({ page }) => {
  await page.keyboard.press("o");
  await page.keyboard.press("K");
  await page.keyboard.press("i");
  await page.keyboard.type("j");
  expect(await position(page)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { actions: string[] }).actions)).toEqual([
    "files",
    "nextTab",
    "focusEditor",
  ]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("j");
  await expect.poll(() => position(page)).toBeGreaterThan(50);
});
