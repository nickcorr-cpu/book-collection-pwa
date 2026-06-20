import { supabase } from "./supabase";
import type { Book, BookInput } from "./types";

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeBarcode(value: string) {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase().trim();
}

export function parseYear(value: string) {
  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

export function searchBooks(books: Book[], query: string) {
  const q = normalizeText(query);
  if (!q) return books;

  return books.filter((book) => {
    const haystack = normalizeText(
      [
        book.barcode ?? "",
        book.title,
        book.authors.join(" "),
        book.description ?? "",
        book.notes ?? "",
      ].join(" ")
    );
    return haystack.includes(q);
  });
}

export async function fetchBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("title", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Book[];
}

export async function getBookById(id: string): Promise<Book | null> {
  const { data, error } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Book | null) ?? null;
}

export async function getBookByBarcode(barcode: string): Promise<Book | null> {
  const clean = normalizeBarcode(barcode);
  if (!clean) return null;

  const { data, error } = await supabase.from("books").select("*").eq("barcode", clean).maybeSingle();
  if (error) throw error;
  return (data as Book | null) ?? null;
}

export async function saveBook(id: string | null, input: BookInput): Promise<Book> {
  const payload = {
    barcode: input.barcode ? normalizeBarcode(input.barcode) : null,
    title: input.title.trim(),
    authors: input.authors.filter(Boolean),
    description: input.description?.trim() || null,
    published_year: input.published_year ?? null,
    cover_url: input.cover_url?.trim() || null,
    notes: input.notes?.trim() || null,
    source: input.source || "manual",
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { data, error } = await supabase
      .from("books")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return data as Book;
  }

  const insertPayload = {
    ...payload,
    created_at: new Date().toISOString(),
  };

  const { data, error } = payload.barcode
    ? await supabase.from("books").upsert(insertPayload, { onConflict: "barcode" }).select("*").single()
    : await supabase.from("books").insert(insertPayload).select("*").single();

  if (error) throw error;
  return data as Book;
}

export async function deleteBook(id: string) {
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) throw error;
}