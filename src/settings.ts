export interface VimflowSettings {
  scrollSpeed: number;
  tapDistance: number;
  hintCharacters: string;
  showModeIndicator: boolean;
}

export const DEFAULT_SETTINGS: Readonly<VimflowSettings> = {
  scrollSpeed: 900,
  tapDistance: 72,
  hintCharacters: "asdfghjkl",
  showModeIndicator: true,
};

export function normalizeAlphabet(input: string): string {
  const characters = [...new Set(input.toLowerCase().replace(/[^a-z]/g, ""))].join("");
  return characters.length >= 2 ? characters : DEFAULT_SETTINGS.hintCharacters;
}

export function normalizeSettings(input: unknown): VimflowSettings {
  const data = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const number = (key: "scrollSpeed" | "tapDistance", min: number, max: number): number => {
    const value = data[key];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : DEFAULT_SETTINGS[key];
  };
  return {
    scrollSpeed: number("scrollSpeed", 100, 3000),
    tapDistance: number("tapDistance", 16, 300),
    hintCharacters: normalizeAlphabet(
      typeof data.hintCharacters === "string"
        ? data.hintCharacters
        : DEFAULT_SETTINGS.hintCharacters,
    ),
    showModeIndicator:
      typeof data.showModeIndicator === "boolean"
        ? data.showModeIndicator
        : DEFAULT_SETTINGS.showModeIndicator,
  };
}
