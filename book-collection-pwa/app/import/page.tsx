import { Suspense } from "react";
import ImportClient from "./ImportClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-4">
          <p className="text-center text-slate-500">Loading...</p>
        </main>
      }
    >
      <ImportClient />
    </Suspense>
  );
}