import { NextResponse } from "next/server";

type LookupResult = {
  barcode: string;
  title: string;
  authors: string[];
  description: string | null;
  published_year: number | null;
  cover_url: string | null;
  source: "open_library" | "librarything";
};

function normalizeBarcode(value: string) {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase().trim();
}

function parseYear(value?: string | null) {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

function isbn13To10(isbn13: string) {
  const clean = normalizeBarcode(isbn13);
  if (clean.length !== 13 || (!clean.startsWith("978") && !clean.startsWith("979"))) {
    return null;
  }

  const core = clean.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < core.length; i++) {
    sum += Number(core[i]) * (10 - i);
  }

  const remainder = 11 - (sum % 11);
  const check = remainder === 10 ? "X" : remainder === 11 ? "0" : String(remainder);
  return core + check;
}

async function lookupOpenLibraryEdition(barcode: string): Promise<LookupResult | null> {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(barcode)}.json`);
    if (!res.ok) return null;

    const book = (await res.json()) as {
      title?: string;
      authors?: Array<{ key: string }>;
      publish_date?: string;
      covers?: number[];
      description?: string | { value?: string };
    };

    if (!book.title) return null;

    let authors: string[] = [];
    if (book.authors?.length) {
      const authorNames = await Promise.all(
        book.authors.map(async (author) => {
          const authorRes = await fetch(`https://openlibrary.org${author.key}.json`);
          if (!authorRes.ok) return null;
          const authorJson = (await authorRes.json()) as { name?: string };
          return authorJson.name ?? null;
        })
      );
      authors = authorNames.filter(Boolean) as string[];
    }

    const coverUrl =
      book.covers?.[0] != null
        ? `https://covers.openlibrary.org/b/id/${book.covers[0]}-L.jpg`
        : null;

    const description =
      typeof book.description === "string"
        ? book.description
        : book.description?.value ?? null;

    return {
      barcode,
      title: book.title,
      authors,
      description,
      published_year: parseYear(book.publish_date),
      cover_url: coverUrl,
      source: "open_library",
    };
  } catch {
    return null;
  }
}

async function lookupOpenLibrarySearch(barcode: string): Promise<LookupResult | null> {
  try {
    const res = await fetch(`https://openlibrary.org/search.json?isbn=${encodeURIComponent(barcode)}`);
    if (!res.ok) return null;

    const json = (await res.json()) as {
      docs?: Array<{
        title?: string;
        author_name?: string[];
        first_publish_year?: number;
        cover_i?: number;
      }>;
    };

    const doc = json.docs?.[0];
    if (!doc?.title) return null;

    return {
      barcode,
      title: doc.title,
      authors: doc.author_name ?? [],
      description: null,
      published_year: doc.first_publish_year ?? null,
      cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
      source: "open_library",
    };
  } catch {
    return null;
  }
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function metaContent(html: string, names: string[]) {
  for (const name of names) {
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return cleanText(match[1]);
    }
  }
  return null;
}

async function lookupLibraryThing(barcode: string): Promise<LookupResult | null> {
  try {
    const res = await fetch(`https://www.librarything.com/isbn/${encodeURIComponent(barcode)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    let title =
      metaContent(html, ["og:title", "twitter:title"]) ??
      cleanText(html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]);

    if (!title) return null;

    title = title.replace(/\s*\|\s*LibraryThing\s*$/i, "").replace(/\s*-\s*LibraryThing\s*$/i, "");

    const description =
      metaContent(html, ["og:description", "description", "twitter:description"]) ?? null;

    const image =
      metaContent(html, ["og:image", "twitter:image"]) ?? null;

    const author =
      metaContent(html, ["book:author", "author", "article:author", "citation_author"]) ?? null;

    const published =
      metaContent(html, ["article:published_time", "citation_publication_date", "date", "pubdate"]) ??
      null;

    return {
      barcode,
      title,
      authors: author ? [author] : [],
      description,
      published_year: parseYear(published),
      cover_url: image,
      source: "librarything",
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("isbn") ?? "";
  const barcode = normalizeBarcode(raw);

  if (!barcode) {
    return NextResponse.json({ book: null, error: "Missing isbn" }, { status: 400 });
  }

  const candidates = Array.from(
    new Set([barcode, isbn13To10(barcode)].filter(Boolean) as string[])
  );

  for (const candidate of candidates) {
    const openEdition = await lookupOpenLibraryEdition(candidate);
    if (openEdition) {
      return NextResponse.json({ book: openEdition });
    }

    const openSearch = await lookupOpenLibrarySearch(candidate);
    if (openSearch) {
      return NextResponse.json({ book: openSearch });
    }

    const libraryThing = await lookupLibraryThing(candidate);
    if (libraryThing) {
      return NextResponse.json({ book: libraryThing });
    }
  }

  return NextResponse.json({ book: null });
}