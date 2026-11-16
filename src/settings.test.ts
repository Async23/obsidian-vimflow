import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeAlphabet, normalizeSettings } from "./settings.ts";
import { makeLabels } from "./hints.ts";

test("invalid saved settings fall back to defaults and numeric limits", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  const settings = normalizeSettings({
    scrollSpeed: Infinity,
    tapDistance: -5,
    showModeIndicator: "false",
  });
  assert.equal(settings.scrollSpeed, 900);
  assert.equal(settings.tapDistance, 16);
  assert.equal(settings.showModeIndicator, true);
});

test("hint alphabets cannot contain duplicate or unreachable keys", () => {
  assert.equal(normalizeAlphabet("AASD3中"), "asd");
  assert.equal(normalizeAlphabet("a"), DEFAULT_SETTINGS.hintCharacters);
});

test("hint codes stay unique and prefix-free as target count grows", () => {
  for (const count of [0, 1, 9, 10, 81, 82, 1000]) {
    const labels = makeLabels(count, "asdfghjkl");
    assert.equal(new Set(labels).size, count);
    assert.ok(
      labels.every((label) => !labels.some((other) => other !== label && other.startsWith(label))),
    );
  }
});
