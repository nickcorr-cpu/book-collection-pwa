"use client";

import AppHeader from "@/components/AppHeader";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { fetchBooks, searchBooks } from "@/lib/books";
import type { Book } from "@/lib/types";

type SortMode = "title" | "author" | "year";

const SORT_STORAGE_KEY = "bookCollectionSortMode";
const LIBRARY_STATE_KEY = "bookLibraryState";

type LibraryState = {
  query: string;
  sortMode: SortMode;
  scrollY: number;
};

function getInitialSortMode(): SortMode {
  if (typeof window === "undefined") return "title";

  const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
  if (saved === "title" || saved === "author" || saved === "year") {
    return saved;
  }

  return "title";
}

function getSortValue(book: Book, sortMode: SortMode) {
  if (sortMode === "title") return book.title ?? "";
  if (sortMode === "author") return book.authors[0] ?? "";
  return book.published_year?.toString() ?? "";
}

function getAlphaIndexLabel(book: Book, sortMode: Exclude<SortMode, "year">) {
  const value = getSortValue(book, sortMode).trim();
  if (!value) return "#";

  const first = value[0].toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
}

function getDecadeLabel(year?: number | null) {
  if (!year) return "#";
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

function saveLibraryState(state: LibraryState) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(LIBRARY_STATE_KEY, JSON.stringify(state));
}

function loadLibraryState(): LibraryState | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(LIBRARY_STATE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LibraryState;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>(getInitialSortMode);

  const sectionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const restoreStateRef = useRef<LibraryState | null>(null);
  const restoredRef = useRef(false);

  const mobileIndexBarRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);
  const [activeMobileLabel, setActiveMobileLabel] = useState<string | null>(null);

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

  useEffect(() => {
    if (loading || restoredRef.current) return;

    restoredRef.current = true;

    const saved = loadLibraryState();
    if (!saved) return;

    restoreStateRef.current = saved;
    setQuery(saved.query);
    setSortMode(saved.sortMode);
  }, [loading]);

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
        const authorCompare = aAuthor.localeCompare(bAuthor, undefined, {
          sensitivity: "base",
        });
        if (authorCompare !== 0) return authorCompare;

        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      }

      const aYear = a.published_year ?? 0;
      const bYear = b.published_year ?? 0;

      if (aYear !== bYear) return bYear - aYear;

      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });

    return items;
  }, [filtered, sortMode]);

  useEffect(() => {
    if (!restoreStateRef.current) return;
    if (loading) return;

    const scrollY = restoreStateRef.current.scrollY;
    restoreStateRef.current = null;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      });
    });
  }, [loading, query, sortMode, sorted.length]);

  const indexEntries = useMemo(() => {
    const seen = new Set<string>();
    const entries: string[] = [];

    for (const book of sorted) {
      const label =
        sortMode === "year"
          ? getDecadeLabel(book.published_year)
          : getAlphaIndexLabel(book, sortMode);

      if (!seen.has(label)) {
        seen.add(label);
        entries.push(label);
      }
    }

    if (sortMode === "year") {
      return entries;
    }

    const alpha = entries.filter((x) => x !== "#").sort();
    const hash = entries.includes("#") ? ["#"] : [];
    return [...alpha, ...hash];
  }, [sorted, sortMode]);

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

  // Clear refs on each render so the index always targets the current list.
  sectionRefs.current = {};

  const registerItemRef = (label: string) => (el: HTMLButtonElement | null) => {
    if (el && !sectionRefs.current[label]) {
      sectionRefs.current[label] = el;
    }
  };

  const scrollToLabel = (label: string) => {
    const el = sectionRefs.current[label];
    if (!el) return;

    el.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const saveAndGo = (path: string) => {
    saveLibraryState({
      query,
      sortMode,
      scrollY: window.scrollY,
    });
    router.push(path);
  };

  const pickLabelAtClientX = (clientX: number) => {
    const container = mobileIndexBarRef.current;
    if (!container) return;

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-index-label]")
    );

    if (!buttons.length) return;

    let closestButton = buttons[0];
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const distance = Math.abs(clientX - centerX);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestButton = button;
      }
    }

    const label = closestButton.dataset.indexLabel;
    if (label) {
      setActiveMobileLabel(label);
      scrollToLabel(label);
    }
  };

  const startScrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    scrubbingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    pickLabelAtClientX(e.clientX);
  };

  const moveScrub = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    pickLabelAtClientX(e.clientX);
  };

  const endScrub = () => {
    scrubbingRef.current = false;
    setActiveMobileLabel(null);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-4 pb-24 lg:pb-4">
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
            onClick={() => saveAndGo("/scan")}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
          >
            Scan
          </button>
          <button
            onClick={() => saveAndGo("/edit")}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-200"
          >
            Add
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_220px]">
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
          <option value="year">Sort: Year (newest first)</option>
        </select>
      </div>

      {loading ? (
        <p className="py-8 text-center text-slate-500">Loading...</p>
      ) : sorted.length === 0 ? (
        <p className="py-8 text-center text-slate-500">
          No books yet. Scan one or add one manually.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_48px]">
          <div className="grid gap-3">
            {sorted.map((book) => {
              const label =
                sortMode === "year"
                  ? getDecadeLabel(book.published_year)
                  : getAlphaIndexLabel(book, sortMode);

              return (
                <button
                  key={book.id}
                  ref={registerItemRef(label)}
                  type="button"
                  onClick={() => saveAndGo(`/edit?id=${book.id}`)}
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
              );
            })}
          </div>

          <aside className="hidden lg:flex lg:justify-end">
            <div
              className="
                sticky top-4 z-20
                flex max-h-[calc(100vh-2rem)] w-full max-w-[56px]
                flex-col flex-nowrap items-center gap-1 overflow-y-auto
                rounded-full bg-white px-1 py-2 shadow-sm ring-1 ring-slate-200
              "
            >
              {indexEntries.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => scrollToLabel(label)}
                  className="
                    flex h-8 w-12 items-center justify-center rounded-full
                    text-[11px] font-semibold text-slate-500 transition
                    hover:bg-slate-900 hover:text-white
                    active:bg-slate-900 active:text-white
                  "
                  aria-label={`Jump to ${label}`}
                  title={`Jump to ${label}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}

      <div className="lg:hidden">
        <div
          ref={mobileIndexBarRef}
          className="
            fixed inset-x-0 bottom-0 z-40
            border-t border-slate-200 bg-white/95 backdrop-blur shadow-lg
            touch-none
          "
          onPointerDown={startScrub}
          onPointerMove={moveScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onPointerLeave={endScrub}
        >
          <div className="flex items-center gap-2 overflow-x-auto px-2 py-2">
            {indexEntries.map((label) => {
              const active = activeMobileLabel === label;

              return (
                <button
                  key={label}
                  type="button"
                  data-index-label={label}
                  onClick={() => scrollToLabel(label)}
                  className={[
                    "shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600",
                  ].join(" ")}
                  aria-label={`Jump to ${label}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}