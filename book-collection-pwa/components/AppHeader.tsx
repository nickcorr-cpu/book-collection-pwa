"use client";

import { useRouter } from "next/navigation";

export default function AppHeader() {
  const router = useRouter();

  return (
    <header className="mb-4 flex w-full items-center justify-between gap-3">
      <button
        onClick={() => router.push("/")}
        className="w-[76px] shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
      >
        Library
      </button>

      <h1 className="min-w-0 flex-1 text-center text-xl font-bold tracking-tight text-slate-900">
        Nick&apos;s Books
      </h1>

      <div className="w-[76px] shrink-0" />
    </header>
  );
}