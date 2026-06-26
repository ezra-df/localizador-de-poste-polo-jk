import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import type { AnnotationColor, NumberAnnotation } from "@/types/annotation";
import {
  ANN_ATTACH_NAME,
  PERSISTENCE_MARKER,
  SOURCE_ATTACH_NAME,
} from "@/lib/pdfPersistence";

const COLOR_MAP: Record<AnnotationColor, ReturnType<typeof rgb>> = {
  black: rgb(0, 0, 0),
  red: rgb(0.85, 0.1, 0.1),
  blue: rgb(0.1, 0.3, 0.85),
};

/**
 * Render annotations directly into the PDF content stream and download.
 * Coordinates are in PDF user space (origin bottom-left), matching what
 * pdf.js `viewport.convertToPdfPoint()` returns.
 */
export async function exportAnnotatedPdf(
  sourceBuffer: ArrayBuffer,
  annotations: NumberAnnotation[],
  outputName: string
): Promise<void> {
  const pdfDoc = await PDFDocument.load(sourceBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Group annotations by page for efficiency.
  const byPage = new Map<number, NumberAnnotation[]>();
  for (const a of annotations) {
    const list = byPage.get(a.page) ?? [];
    list.push(a);
    byPage.set(a.page, list);
  }

  const pages = pdfDoc.getPages();
  for (const [pageNum, anns] of byPage) {
    const page = pages[pageNum - 1];
    if (!page) continue;
    // PDF /Rotate is applied clockwise by the viewer; pdf-lib's `degrees()` is
    // counter-clockwise. To keep the glyph upright in the viewer we rotate the
    // text by +rotation (CCW), which cancels the viewer's CW rotation.
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const theta = (rotation * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    for (const a of anns) {
      const size = a.fontSize;
      const textWidth = font.widthOfTextAtSize(a.text, size);
      // drawText anchors at the left of the baseline; after rotating by theta
      // (CCW), the text's local "right" axis is (cos, sin) and "up" is (-sin, cos).
      // Place the anchor so the visual center of the glyph row lands on (a.x, a.y).
      const halfW = textWidth / 2;
      const baselineOffset = size / 3;
      const x = a.x - halfW * cos - baselineOffset * -sin;
      const y = a.y - halfW * sin - baselineOffset * cos;
      page.drawText(a.text, {
        x,
        y,
        size,
        font,
        color: COLOR_MAP[a.color],
        rotate: rotation ? degrees(rotation) : undefined,
      });
    }
  }

  const bytes = await pdfDoc.save();
  // Wrap in a fresh Uint8Array so the Blob owns a standalone ArrayBuffer.
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = outputName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
