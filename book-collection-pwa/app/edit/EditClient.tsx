"use client";

import AppHeader from "@/components/AppHeader";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import {
  deleteBook,
  getBookById,
  normalizeBarcode,
  parseYear,
  saveBook,
} from "@/lib/books";
import type { Book } from "@/lib/types";

type FormState = {
  barcode: string;
  title: string;
  authors: string;
  description: string;
  publishedYear: string;
  coverUrl: string;
  notes: string;
  source: string;
};

function emptyForm(): FormState {
  return {
    barcode: "",
    title: "",
    authors: "",
    description: "",
    publishedYear: "",
    coverUrl: "",
    notes: "",
    source: "manual",
  };
}

function formFromBook(book: Book): FormState {
  return {
    barcode: book.barcode ?? "",
    title: book.title ?? "",
    authors: book.authors.join(", "),
    description: book.description ?? "",
    publishedYear: book.published_year ? String(book.published_year) : "",
    coverUrl: book.cover_url ?? "",
    notes: book.notes ?? "",
    source: book.source ?? "manual",
  };
}

function authorsToJson(authors: string) {
  return JSON.stringify(
    authors
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean)
  );
}

export default function EditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const prefill = useMemo<FormState>(
    () => ({
      barcode: searchParams.get("barcode") ?? "",
      title: searchParams.get("title") ?? "",
      authors: (() => {
        const raw = searchParams.get("authors");
        if (!raw) return "";
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed.join(", ") : "";
        } catch {
          return "";
        }
      })(),
      description: searchParams.get("description") ?? "",
      publishedYear: searchParams.get("publishedYear") ?? "",
      coverUrl: searchParams.get("coverUrl") ?? "",
      notes: searchParams.get("notes") ?? "",
      source: searchParams.get("source") ?? "manual",
    }),
    [searchParams]
  );

  const [form, setForm] = useState<FormState>(emptyForm());
  const [book, setBook] = useState<Book | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));

  const [scanOpen, setScanOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState("Starting camera...");
  const [scanError, setScanError] = useState("");

  const barcodeVideoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeControlsRef = useRef<IScannerControls | null>(null);
  const barcodeScannedRef = useRef(false);

  useEffect(() => {
    async function load() {
      if (!id) {
        setForm(prefill);
        setLoading(false);
        return;
      }

      setLoading(true);
      const existing = await getBookById(id);
      setBook(existing);
      setForm(existing ? formFromBook(existing) : prefill);
      setLoading(false);
    }

    load();
  }, [id, prefill]);

  useEffect(() => {
    if (!scanOpen || !barcodeVideoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    barcodeScannedRef.current = false;
    setScanError("");
    setScanStatus("Point the camera at the barcode.");

    let controls: IScannerControls | null = null;

    reader
      .decodeFromVideoDevice(undefined, barcodeVideoRef.current, async (result, error) => {
        if (result && !barcodeScannedRef.current) {
          barcodeScannedRef.current = true;
          const raw = normalizeBarcode(result.getText());

          if (!raw) {
            setScanError("Could not read a valid barcode.");
            return;
          }

          setForm((prev) => ({ ...prev, barcode: raw }));
          setScanStatus(`Captured ${raw}`);

          controls?.stop();
          barcodeControlsRef.current = null;
          setScanOpen(false);
          return;
        }

        if (error) {
          // Ignore scan noise while the camera is searching.
        }
      })
      .then((c) => {
        controls = c;
        barcodeControlsRef.current = c;
      })
      .catch(() => {
        setScanError("Camera could not start. Check permissions and try again.");
      });

    return () => {
      controls?.stop();
      barcodeControlsRef.current = null;
    };
  }, [scanOpen]);

  function buildImportUrl(extra: Record<string, string>) {
    const params = new URLSearchParams();

    if (id) params.set("id", id);
    params.set("barcode", form.barcode);
    params.set("title", form.title);
    params.set("authors", authorsToJson(form.authors));
    params.set("description", form.description);
    params.set("publishedYear", form.publishedYear);
    params.set("coverUrl", form.coverUrl);
    params.set("notes", form.notes);
    params.set("source", form.source);

    for (const [key, value] of Object.entries(extra)) {
      params.set(key, value);
    }

    return `/import?${params.toString()}`;
  }

  function searchForBook() {
    const q = [form.title, form.authors].filter(Boolean).join(" ").trim();
    router.push(buildImportUrl({ query: q, mode: "book" }));
  }

  function searchForCover() {
    const q = [form.title, form.authors].filter(Boolean).join(" ").trim();
    router.push(buildImportUrl({ query: q, mode: "media", target: "cover" }));
  }

  function searchForDescription() {
    const q = [form.title, form.authors].filter(Boolean).join(" ").trim();
    router.push(buildImportUrl({ query: q, mode: "media", target: "description" }));
  }

  function goBackToLibrary() {
    router.push("/");
  }

  async function onSave() {
    if (!form.title.trim()) {
      alert("Please enter a title.");
      return;
    }

    setSaving(true);
    try {
      await saveBook(id, {
        barcode: form.barcode || null,
        title: form.title,
        authors: form.authors.split(",").map((a) => a.trim()).filter(Boolean),
        description: form.description || null,
        published_year: parseYear(form.publishedYear),
        cover_url: form.coverUrl || null,
        notes: form.notes || null,
        source: form.source || "manual",
      });

      router.push("/");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!book) return;
    const ok = confirm("Delete this book?");
    if (!ok) return;

    await deleteBook(book.id);
    router.push("/");
  }

  if (loading) {
    return <main className="p-4 text-center text-slate-500">Loading...</main>;
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-4">
      <AppHeader />

      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">
          {id ? "Edit book" : "Add book"}
        </h1>

        <button
          type="button"
          onClick={goBackToLibrary}
          className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-200"
        >
          Back to library
        </button>
      </div>

      {form.coverUrl ? (
        <img
          src={form.coverUrl}
          alt={form.title || "Book cover"}
          className="mb-4 h-64 w-40 rounded-3xl object-cover"
        />
      ) : null}

      <div className="grid gap-3">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">Barcode</span>
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            >
              {form.barcode ? "Re-scan barcode" : "Scan barcode"}
            </button>
          </div>

          <input
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            placeholder="Scan or type barcode"
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-500 outline-none"
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">Title</span>
            <button
              type="button"
              onClick={searchForBook}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            >
              Search book
            </button>
          </div>

          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Book title"
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-500 outline-none"
          />
        </div>

        <Field
          label="Authors"
          value={form.authors}
          onChange={(v) => setForm({ ...form, authors: v })}
          placeholder="One author, Another author"
        />

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">
              Cover image URL
            </span>
            <button
              type="button"
              onClick={searchForCover}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            >
              Search cover
            </button>
          </div>

          <input
            value={form.coverUrl}
            onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
            placeholder="Paste cover image URL"
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-500 outline-none"
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">Description</span>
            <button
              type="button"
              onClick={searchForDescription}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            >
              Search description
            </button>
          </div>

          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Paste or type a description"
            className="min-h-28 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-500 outline-none"
          />
        </div>

        <Field
          label="Publication year"
          value={form.publishedYear}
          onChange={(v) => setForm({ ...form, publishedYear: v })}
        />
        <Field
          label="Notes"
          value={form.notes}
          onChange={(v) => setForm({ ...form, notes: v })}
          multiline
        />
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>

        {book ? (
          <button
            onClick={onDelete}
            className="rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-700 ring-1 ring-rose-200"
          >
            Delete
          </button>
        ) : null}
      </div>

      {scanOpen ? (
        <div className="fixed inset-0 z-50 bg-black/80 p-4">
          <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 rounded-3xl bg-slate-950 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Scan barcode</h2>
                <p className="text-sm text-slate-300">
                  Point the camera at the barcode on the book.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  barcodeControlsRef.current?.stop();
                  barcodeControlsRef.current = null;
                  setScanOpen(false);
                }}
                className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                Close
              </button>
            </div>

            {scanError ? (
              <div className="rounded-2xl bg-rose-100 p-3 text-sm text-rose-800">
                {scanError}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-3xl bg-black">
              <video
                ref={barcodeVideoRef}
                autoPlay
                muted
                playsInline
                className="h-[60vh] w-full object-cover"
              />
            </div>

            <p className="text-center text-sm text-slate-300">{scanStatus}</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-28 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-500 outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-500 outline-none"
        />
      )}
    </label>
  );
}