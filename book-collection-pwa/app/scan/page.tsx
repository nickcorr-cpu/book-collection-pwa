"use client";

import AppHeader from "@/components/AppHeader";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { getBookByBarcode, normalizeBarcode } from "@/lib/books";

type LookupResponse =
  | {
      book: {
        barcode: string;
        title: string;
        authors: string[];
        description: string | null;
        published_year: number | null;
        cover_url: string | null;
        source: string;
      };
    }
  | {
      book: null;
    };

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scannedRef = useRef(false);

  const [started, setStarted] = useState(true);
  const [status, setStatus] = useState("Starting camera...");

  useEffect(() => {
    if (!started || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    scannedRef.current = false;
    setStatus("Point the camera at a book barcode.");

    let controls: IScannerControls | null = null;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current, async (result, error) => {
        if (result && !scannedRef.current) {
          scannedRef.current = true;
          const raw = normalizeBarcode(result.getText());
          setStatus(`Found barcode ${raw}. Looking it up...`);

          controls?.stop();
          controlsRef.current = null;

          const existing = await getBookByBarcode(raw);
          if (existing) {
            router.replace(`/edit?id=${existing.id}`);
            return;
          }

          const response = await fetch(`/api/lookup?isbn=${encodeURIComponent(raw)}`);
          const data = (await response.json()) as LookupResponse;

          if (!data.book) {
            router.replace(`/import?query=${encodeURIComponent(raw)}`);
            return;
          }

          const params = new URLSearchParams({
            barcode: data.book.barcode,
            title: data.book.title,
            authors: JSON.stringify(data.book.authors ?? []),
            description: data.book.description ?? "",
            publishedYear: data.book.published_year ? String(data.book.published_year) : "",
            coverUrl: data.book.cover_url ?? "",
            source: data.book.source,
          });

          router.replace(`/edit?${params.toString()}`);
          return;
        }

        if (error) {
          // Ignore scan noise while the camera searches.
        }
      })
      .then((c) => {
        controls = c;
        controlsRef.current = c;
      })
      .catch(() => {
        setStatus("Camera could not start. Check permissions and try again.");
      });

    return () => {
      controls?.stop();
      controlsRef.current = null;
    };
  }, [started, router]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-4">
  <AppHeader />
      <div className="mb-4 flex gap-3">
        <button
          onClick={() => {
            controlsRef.current?.stop();
            setStarted(false);
            setTimeout(() => setStarted(true), 50);
          }}
          className="rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white"
        >
          Restart camera
        </button>

        <button
          onClick={() => {
            controlsRef.current?.stop();
            router.back();
          }}
          className="rounded-2xl bg-white px-4 py-3 font-semibold text-slate-900 ring-1 ring-slate-200"
        >
          Cancel
        </button>
      </div>

      <div className="overflow-hidden rounded-3xl bg-slate-900">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-[70vh] w-full object-cover"
        />
      </div>

      <p className="mt-4 text-center text-sm text-slate-600">{status}</p>
    </main>
  );
}