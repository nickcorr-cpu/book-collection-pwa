"use client";

import AppHeader from "@/components/AppHeader";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchBooks, searchBooks } from "@/lib/books";
import type { Book } from "@/lib/types";

type SortMode = "title" | "author" | "year";

const SORT_STORAGE_KEY = "bookCollectionSortMode";

function getInitialSortMode(): SortMode {
  if (typeof window === "undefined") return "title";

  const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
  if (saved === "title" || saved === "author" || saved === "year") {
    return saved;
  }

  return "title";
}

export default function HomePage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>(getInitialSortMode);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchBooks();
      setBooks(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SORT_STORAGE_KEY, sortMode);
  }, [sortMode]);

  const filtered = useMemo(() => searchBooks(books, query), [books, query]);

  const sorted = useMemo(() => {
    const items = [...filtered];

    items.sort((a, b) => {
      if (sortMode === "title") {
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      }

      if (sortMode === "author") {
        const aAuthor = a.authors[0] ?? "";
        const bAuthor = b.authors[0] ?? "";
        const authorCompare = aAuthor.localeCompare(bAuthor, undefined, { sensitivity: "base" });
        if (authorCompare !== 0) return authorCompare;

        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      }

      const aYear = a.published_year ?? Number.POSITIVE_INFINITY;
      const bYear = b.published_year ?? Number.POSITIVE_INFINITY;

      if (aYear !== bYear) return aYear - bYear;

      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });

    return items;
  }, [filtered, sortMode]);

  const uniqueAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const book of books) {
      for (const author of book.authors) {
        const cleaned = author.trim();
        if (cleaned) set.add(cleaned);
      }
    }
    return set.size;
  }, [books]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-4">
      <AppHeader />

      <div className="mb-4 flex w-full flex-wrap items-center gap-2">
        <div className="rounded-2xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200">
          <span className="font-medium text-slate-600">Books:</span>{" "}
          <span className="font-semibold text-slate-900">{books.length}</span>
        </div>

        <div className="rounded-2xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200">
          <span className="font-medium text-slate-600">Authors:</span>{" "}
          <span className="font-semibold text-slate-900">{uniqueAuthors}</span>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => router.push("/scan")}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
          >
            Scan
          </button>
          <button
            onClick={() => router.push("/edit")}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-200"
          >
            Add
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by barcode, title, author"
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-500 outline-none"
        />

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none"
        >
          <option value="title">Sort: Title A–Z</option>
          <option value="author">Sort: Author A–Z</option>
          <option value="year">Sort: Year (oldest first)</option>
        </select>
      </div>

      {loading ? (
        <p className="py-8 text-center text-slate-500">Loading...</p>
      ) : sorted.length === 0 ? (
        <p className="py-8 text-center text-slate-500">
          No books yet. Scan one or add one manually.
        </p>
      ) : (
        <div className="grid gap-3">
          {sorted.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => router.push(`/edit?id=${book.id}`)}
              className="flex w-full gap-4 rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200"
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

              <div className="min-w-0 flex-1 overflow-hidden">
                <h2
                  className="line-clamp-2 text-lg font-semibold text-slate-900"
                  title={book.title}
                >
                  {book.title}
                </h2>

                <p
                  className="truncate text-sm text-slate-700"
                  title={book.authors.join(", ")}
                >
                  {book.authors.join(", ") || "Unknown author"}
                </p>

                <p className="text-sm text-slate-600">
                  {book.published_year ?? "No year"}
                </p>

                {book.description ? (
                  <>
                    <p
                      className="mt-2 line-clamp-3 text-xs text-slate-500"
                      title={book.description}
                    >
                      {book.description}
                    </p>

                    <div className="mt-1 text-xs font-medium text-slate-600">
                      Read more →
                    </div>
                  </>
                ) : null}

                <p className="mt-2 text-xs text-slate-500">
                  {book.barcode ? `Barcode: ${book.barcode}` : "No barcode"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}