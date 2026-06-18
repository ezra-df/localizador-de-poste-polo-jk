// Per-PDF page rotations, persisted in localStorage.
// Keyed by file name. Rotations are normalized to 0 / 90 / 180 / 270.

const PREFIX = "pole-locator:rotations:";

export type RotationMap = Record<number, number>;

export function loadRotations(fileName: string | null | undefined): RotationMap {
  if (!fileName) return {};
  try {
    const raw = localStorage.getItem(PREFIX + fileName);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as RotationMap;
  } catch {}
  return {};
}

export function saveRotations(fileName: string | null | undefined, map: RotationMap): void {
  if (!fileName) return;
  try {
    // Strip zero entries to keep payload small.
    const clean: RotationMap = {};
    for (const [k, v] of Object.entries(map)) {
      const n = ((v % 360) + 360) % 360;
      if (n !== 0) clean[Number(k)] = n;
    }
    if (Object.keys(clean).length === 0) {
      localStorage.removeItem(PREFIX + fileName);
    } else {
      localStorage.setItem(PREFIX + fileName, JSON.stringify(clean));
    }
  } catch {}
}

export function clearRotations(fileName: string | null | undefined): void {
  if (!fileName) return;
  try { localStorage.removeItem(PREFIX + fileName); } catch {}
}
