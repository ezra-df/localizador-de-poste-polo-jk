// Persistence for the PDF annotator (separate from the locator's stored PDF).
// - PDF file is kept in IndexedDB (single slot).
// - Annotations + settings are kept in localStorage, keyed by file name.

import type { AnnotationSettings, NumberAnnotation } from "@/types/annotation";

const DB_NAME = "pole-locator";
const STORE = "annotator-pdfs";
const KEY = "current";

interface StoredPdf {
  name: string;
  data: ArrayBuffer;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Bump version so the new object store is created alongside the locator's store.
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("pdfs")) db.createObjectStore("pdfs");
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAnnotatorPdf(name: string, data: ArrayBuffer): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const copy = data.slice(0);
    tx.objectStore(STORE).put({ name, data: copy, savedAt: Date.now() } as StoredPdf, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadAnnotatorPdf(): Promise<StoredPdf | null> {
  const db = await openDb();
  const result = await new Promise<StoredPdf | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as StoredPdf) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function clearAnnotatorPdf(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const ANN_PREFIX = "pole-annotator:annotations:";
const SET_PREFIX = "pole-annotator:settings:";

export function loadAnnotations(fileName: string | null | undefined): NumberAnnotation[] {
  if (!fileName) return [];
  try {
    const raw = localStorage.getItem(ANN_PREFIX + fileName);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr as NumberAnnotation[];
  } catch {}
  return [];
}

export function saveAnnotations(fileName: string | null | undefined, anns: NumberAnnotation[]): void {
  if (!fileName) return;
  try {
    if (anns.length === 0) localStorage.removeItem(ANN_PREFIX + fileName);
    else localStorage.setItem(ANN_PREFIX + fileName, JSON.stringify(anns));
  } catch {}
}

export function loadSettings(fileName: string | null | undefined): AnnotationSettings | null {
  if (!fileName) return null;
  try {
    const raw = localStorage.getItem(SET_PREFIX + fileName);
    if (!raw) return null;
    return JSON.parse(raw) as AnnotationSettings;
  } catch {
    return null;
  }
}

export function saveSettings(fileName: string | null | undefined, s: AnnotationSettings): void {
  if (!fileName) return;
  try { localStorage.setItem(SET_PREFIX + fileName, JSON.stringify(s)); } catch {}
}
