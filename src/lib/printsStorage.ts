// Persists print generation settings per file in localStorage.
export interface PrintsSettings {
  prefix: string;
  minDigits: number;
  zoom: number; // fraction of page width used for crop width (0.05 - 1)
  aspect: string; // "4:3" | "1:1" | "16:9" | "3:4" | "9:16"
  dpi: number;
  quality: number; // 0-1
  offsetX: number; // PDF points, shift crop center
  offsetY: number;
}

const PREFIX = "pole-prints:settings:";

export const DEFAULT_PRINTS_SETTINGS: PrintsSettings = {
  prefix: "P",
  minDigits: 3,
  zoom: 0.15,
  aspect: "4:3",
  dpi: 150,
  quality: 0.85,
  offsetX: 0,
  offsetY: 0,
};

export function loadPrintsSettings(fileName: string | null | undefined): PrintsSettings {
  if (!fileName) return { ...DEFAULT_PRINTS_SETTINGS };
  try {
    const raw = localStorage.getItem(PREFIX + fileName);
    if (!raw) return { ...DEFAULT_PRINTS_SETTINGS };
    return { ...DEFAULT_PRINTS_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PRINTS_SETTINGS };
  }
}

export function savePrintsSettings(fileName: string | null | undefined, s: PrintsSettings): void {
  if (!fileName) return;
  try { localStorage.setItem(PREFIX + fileName, JSON.stringify(s)); } catch {}
}

export function aspectRatio(aspect: string): number {
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h) return 4 / 3;
  return w / h;
}
