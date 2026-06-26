// Persistência embutida no PDF: anexa o PDF-fonte e o JSON das anotações ao
// arquivo exportado, de modo que ele possa ser reaberto e continuar editável.
//
// Detecção: o campo /Info /Keywords do PDF contém o marcador abaixo.
// Anexos (Embedded Files):
//   _pole_source.pdf       -> PDF original (sem texto queimado)
//   _pole_annotations.json -> NumberAnnotation[] em JSON
import { pdfjsLib } from "@/lib/pdfjs";
import type { NumberAnnotation } from "@/types/annotation";

export const PERSISTENCE_MARKER = "LOCALIZADOR_POSTES_V1";
export const SOURCE_ATTACH_NAME = "_pole_source.pdf";
export const ANN_ATTACH_NAME = "_pole_annotations.json";

export interface PersistedPdfData {
  /** PDF original, sem os números desenhados (para reuso na re-exportação). */
  sourceBuffer: ArrayBuffer;
  annotations: NumberAnnotation[];
}

/**
 * Tenta extrair os dados de persistência embutidos em um PDF previamente
 * exportado pelo app. Retorna null se o PDF não contiver os metadados.
 *
 * Observação: faz uma cópia do buffer porque pdf.js pode "destacá-lo".
 */
export async function tryReadPersistedData(
  buffer: ArrayBuffer
): Promise<PersistedPdfData | null> {
  try {
    const doc = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
    const meta = await doc.getMetadata().catch(() => null);
    const info: any = (meta as any)?.info ?? {};
    const keywords: string = typeof info.Keywords === "string" ? info.Keywords : "";
    if (!keywords.includes(PERSISTENCE_MARKER)) return null;

    const attachments = (await doc.getAttachments().catch(() => null)) as
      | Record<string, { filename: string; content: Uint8Array }>
      | null;
    if (!attachments) return null;

    // pdf.js às vezes usa filename literal como chave, às vezes outra; varremos.
    let src: Uint8Array | null = null;
    let ann: Uint8Array | null = null;
    for (const key of Object.keys(attachments)) {
      const entry = attachments[key];
      const name = entry?.filename ?? key;
      if (name === SOURCE_ATTACH_NAME) src = entry.content;
      else if (name === ANN_ATTACH_NAME) ann = entry.content;
    }
    if (!src || !ann) return null;

    const annText = new TextDecoder().decode(ann);
    const annotations = JSON.parse(annText) as NumberAnnotation[];
    if (!Array.isArray(annotations)) return null;

    // Copiamos para um ArrayBuffer independente do buffer interno do pdf.js.
    const sourceBuffer = src.slice().buffer;
    return { sourceBuffer, annotations };
  } catch {
    return null;
  }
}
