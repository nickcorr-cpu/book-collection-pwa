"use client";

import AppHeader from "@/components/AppHeader";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type OpenLibrarySearchDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
};

type SearchResponse = {
  docs?: OpenLibrarySearchDoc[];
};

type BookDraft = {
  barcode: string;
  title: string;
  authors: string[];
  description: string | null;
  published_year: number | null;
  cover_url: string | null;
  source: string;
};

function normalizeBarcode(value: string) {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase().trim();
}

function parseYear(value?: number | string | null) {
  if (value == null) return null;

  if (typeof value === "number") {
    return value;
  }

  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

export default function ImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(
    searchParams.get("query") ?? ""
  );

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BookDraft[]>([]);
  const [error, setError] = useState("");

  const canSearch = useMemo(
    () => query.trim().length > 0,
    [query]
  );

  async function runSearch(searchValue?: string) {
    const q = (searchValue ?? query).trim();

    if (!q) return;

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const clean = normalizeBarcode(q);

      const url =
        clean.length >= 10
          ? `https://openlibrary.org/search.json?isbn=${encodeURIComponent(
              clean
            )}`
          : `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}`;

      const res = await fetch(url);

      if (!res.ok) {
        throw new Error("Search failed");
      }

      const json = (await res.json()) as SearchResponse;
      const docs = json.docs ?? [];

      const mapped: BookDraft[] = docs.slice(0, 20).map((doc) => {
        const barcode =
          doc.isbn?.[0] ??
          clean ??
          "";

        const coverUrl =
          doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
            : null;

        return {
          barcode,
          title: doc.title ?? "Untitled book",
          authors: doc.author_name ?? [],
          description: null,
          published_year: parseYear(doc.first_publish_year),
          cover_url: coverUrl,
          source: "open_library_search",
        };
      });

      setResults(mapped);

      if (mapped.length === 0) {
        setError(
          "No matches found. Try searching by title or author."
        );
      }
    } catch {
      setError("Search failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialQuery = searchParams.get("query");

    if (!initialQuery) return;

    setQuery(initialQuery);

    void runSearch(initialQuery);
  }, [searchParams]);

  function pickResult(book: BookDraft) {
    const params = new URLSearchParams({
      barcode: book.barcode ?? "",
      title: book.title ?? "",
      authors: JSON.stringify(book.authors ?? []),
      description: book.description ?? "",
      publishedYear: book.published_year
        ? String(book.published_year)
        : "",
      coverUrl: book.cover_url ?? "",
      source: book.source ?? "open_library_search",
    });

    router.push(`/edit?${params.toString()}`);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-4">
  <AppHeader />
      <h1 className="mb-2 text-2xl font-bold">
        Import Book
      </h1>

      <p className="mb-4 text-sm text-slate-600">
        Search by ISBN, title, or author.
        Tap a result to populate the book form.
      </p>

      <div className="mb-4 flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void runSearch();
            }
          }}
          placeholder="ISBN, title, or author"
          className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
        />

        <button
          onClick={() => void runSearch()}
          disabled={!canSearch || loading}
          className="rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3">
        {results.map((book, index) => (
          <button
            key={`${book.barcode}-${index}`}
            onClick={() => pickResult(book)}
            className="flex gap-4 rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200"
          >
            <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
              {book.cover_url ? (
                <img
                  src={book.cover_url}
                  alt={book.title}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">
                {book.title}
              </h2>

              <p className="truncate text-sm text-slate-600">
                {book.authors.join(", ") ||
                  "Unknown author"}
              </p>

              <p className="text-sm text-slate-600">
                {book.published_year ?? "No year"}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {book.barcode
                  ? `Barcode: ${book.barcode}`
                  : "No barcode"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}