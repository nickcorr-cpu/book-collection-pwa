export type Book = {
  id: string;
  barcode: string | null;
  title: string;
  authors: string[];
  description: string | null;
  published_year: number | null;
  cover_url: string | null;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type BookInput = {
  barcode: string | null;
  title: string;
  authors: string[];
  description: string | null;
  published_year: number | null;
  cover_url: string | null;
  notes: string | null;
  source: string;
};