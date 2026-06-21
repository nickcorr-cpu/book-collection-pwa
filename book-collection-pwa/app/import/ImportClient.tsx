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

type WebDraft = {
  title: string;
  url: string;
  description: string | null;
  cover_url: string | null;
  source: string;
};

function normalizeBarcode(value: string) {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase().trim();
}

function parseYear(value?: number | string | null) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

function buildBaseEditParams(searchParams: ReturnType<typeof useSearchParams>) {
  const params = new URLSearchParams();

  const keys = [
    "id",
    "barcode",
    "title",
    "authors",
    "description",
    "publishedYear",
    "coverUrl",
    "notes",
    "source",
  ] as const;

  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }

  return params;
}

export default function ImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "media" ? "media" : "book";
  const target =
    searchParams.get("target") === "cover"
      ? "cover"
      : searchParams.get("target") === "description"
        ? "description"
        : null;

  const [query, setQuery] = useState(searchParams.get("query") ?? "");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<BookDraft | WebDraft>>([]);
  const [error, setError] = useState("");

  const canSearch = useMemo(() => query.trim().length > 0, [query]);
  const baseEditParams = useMemo(() => buildBaseEditParams(searchParams), [searchParams]);

  function goBackToBook() {
    router.push(`/edit?${baseEditParams.toString()}`);
  }

  async function runSearch(searchValue?: string) {
    const q = (searchValue ?? query).trim();
    if (!q) return;

    setLoading(true);
    setError("");
    setResults([]);

    try {
      if (mode === "media") {
        const res = await fetch(`/api/web-search?query=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error("Search failed");
        const json = (await res.json()) as { results?: WebDraft[] };
        const mapped = json.results ?? [];
        setResults(mapped);

        if (mapped.length === 0) {
          setError("No matches found. Try another title or author.");
        }
      } else {
        const clean = normalizeBarcode(q);

        const url =
          clean.length >= 10
            ? `https://openlibrary.org/search.json?isbn=${encodeURIComponent(clean)}`
            : `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error("Search failed");
        }

        const json = (await res.json()) as SearchResponse;
        const docs = json.docs ?? [];

        const mapped: BookDraft[] = docs.slice(0, 20).map((doc) => {
          const barcode = doc.isbn?.[0] ?? clean ?? "";
          const coverUrl = doc.cover_i
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
          setError("No matches found. Try searching by title or author.");
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function mergeEditParams(extra: Record<string, string>) {
    const params = new URLSearchParams(baseEditParams);

    for (const [key, value] of Object.entries(extra)) {
      params.set(key, value);
    }

    return `/edit?${params.toString()}`;
  }

  function pickBookResult(book: BookDraft) {
    router.push(
      mergeEditParams({
        barcode: book.barcode ?? "",
        title: book.title ?? "",
        authors: JSON.stringify(book.authors ?? []),
        description: book.description ?? "",
        publishedYear: book.published_year ? String(book.published_year) : "",
        coverUrl: book.cover_url ?? "",
        source: book.source ?? "open_library_search",
      })
    );
  }

  function pickWebResult(item: WebDraft) {
    const extra: Record<string, string> = {
      source: item.source ?? "web_search",
    };

    if (target === "cover") {
      extra.coverUrl = item.cover_url ?? "";
    } else if (target === "description") {
      extra.description = item.description ?? "";
    } else {
      extra.coverUrl = item.cover_url ?? "";
      extra.description = item.description ?? "";
    }

    router.push(mergeEditParams(extra));
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-4">
      <AppHeader />

      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {mode === "media"
            ? target === "cover"
              ? "Search cover"
              : target === "description"
                ? "Search description"
                : "Search cover & description"
            : "Import book"}
        </h1>

        <button
          type="button"
          onClick={goBackToBook}
          className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-200"
        >
          Back to book
        </button>
      </div>

      <p className="mb-4 text-sm text-slate-600">
        {mode === "media"
          ? "Search the web for a matching page, then use the cover or description."
          : "Search by ISBN, title, or author. Tap a result to fill the book form."}
      </p>

      <div className="mb-4 flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runSearch();
          }}
          placeholder={mode === "media" ? "Title or author" : "ISBN, title, or author"}
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

      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-3">
        {mode === "media"
          ? (results as WebDraft[]).map((item, index) => (
              <div
                key={`${item.url}-${index}`}
                className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex gap-4">
                  <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {item.cover_url ? (
                      <img
                        src={item.cover_url}
                        alt={item.title}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-slate-900">
                      {item.title}
                    </h2>
                    <p className="mt-1 break-all text-xs text-slate-500">{item.url}</p>
                    {item.description ? (
                      <p className="mt-2 line-clamp-3 text-xs text-slate-500">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => pickWebResult(item)}
                    className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
                  >
                    {target === "cover"
                      ? "Use cover"
                      : target === "description"
                        ? "Use description"
                        : "Use result"}
                  </button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-200"
                  >
                    Open page
                  </a>
                </div>
              </div>
            ))
          : (results as BookDraft[]).map((book, index) => (
              <button
                key={`${book.barcode}-${index}`}
                onClick={() => pickBookResult(book)}
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
                  <h2 className="truncate text-lg font-semibold text-slate-900">
                    {book.title}
                  </h2>
                  <p className="truncate text-sm text-slate-600">
                    {book.authors.join(", ") || "Unknown author"}
                  </p>
                  <p className="text-sm text-slate-600">{book.published_year ?? "No year"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {book.barcode ? `Barcode: ${book.barcode}` : "No barcode"}
                  </p>
                </div>
              </button>
            ))}
      </div>
    </main>
  );
}