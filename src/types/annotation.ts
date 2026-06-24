export type AnnotationColor = "black" | "red" | "blue";

export interface NumberAnnotation {
  id: string;
  page: number;
  x: number; // PDF user-space coords (origin bottom-left)
  y: number;
  text: string;
  color: AnnotationColor;
  fontSize: number; // in PDF points
}

export interface AnnotationSettings {
  nextNumber: number;
  step: number;
  prefix: string;
  suffix: string;
  color: AnnotationColor;
  fontSize: number;
}

export const DEFAULT_SETTINGS: AnnotationSettings = {
  nextNumber: 1,
  step: 1,
  prefix: "",
  suffix: "",
  color: "black",
  fontSize: 12,
};
