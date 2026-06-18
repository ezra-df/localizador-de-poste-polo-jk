export interface PoleLocation {
  poleNumber: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

export interface PdfIndex {
  [poleNumber: string]: PoleLocation;
}

export interface SearchResult {
  found: boolean;
  location?: PoleLocation;
}

export interface PoleStats {
  total: number;
  min: number | null;
  max: number | null;
  perPage: Record<number, number>;
}
