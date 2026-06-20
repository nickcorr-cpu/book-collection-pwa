export type BookMetadata = {
  barcode: string;
  title: string;
  authors: string[];
  description: string | null;
  published_year: number | null;
  cover_url: string | null;
  source: "google_books" | "open_library";
};

function parseYear(value?: string | null) {
  if (!value) return null;

  const match = value.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

export async function lookupBookByIsbn(
  rawBarcode: string
): Promise<BookMetadata | null> {
  const barcode = rawBarcode.replace(/[^0-9Xx]/g, "").toUpperCase();

  if (!barcode) return null;

  const google = await lookupGoogleBooks(barcode);
  if (google) return google;

  const openLibrary = await lookupOpenLibrary(barcode);
  if (openLibrary) return openLibrary;

  return null;
}

async function lookupGoogleBooks(
  barcode: string
): Promise<BookMetadata | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(
        barcode
      )}`
    );

    if (!res.ok) return null;

    const json = (await res.json()) as {
      items?: Array<{
        volumeInfo?: {
          title?: string;
          authors?: string[];
          description?: string;
          publishedDate?: string;
          imageLinks?: {
            thumbnail?: string;
            smallThumbnail?: string;
          };
        };
      }>;
    };

    const info = json.items?.[0]?.volumeInfo;

    if (!info?.title) return null;

    const cover =
      info.imageLinks?.thumbnail?.replace("http://", "https://") ??
      info.imageLinks?.smallThumbnail?.replace("http://", "https://") ??
      null;

    return {
      barcode,
      title: info.title,
      authors: info.authors ?? [],
      description: info.description ?? null,
      published_year: parseYear(info.publishedDate),
      cover_url: cover,
      source: "google_books",
    };
  } catch {
    return null;
  }
}

async function lookupOpenLibrary(
  barcode: string
): Promise<BookMetadata | null> {
  try {
    const res = await fetch(
      `https://openlibrary.org/isbn/${encodeURIComponent(barcode)}.json`
    );

    if (!res.ok) return null;

    const book = (await res.json()) as {
      title?: string;
      authors?: Array<{ key: string }>;
      publish_date?: string;
      covers?: number[];
    };

    if (!book.title) return null;

    let authors: string[] = [];

    if (book.authors?.length) {
      const authorNames = await Promise.all(
        book.authors.map(async (author) => {
          const authorRes = await fetch(
            `https://openlibrary.org${author.key}.json`
          );

          if (!authorRes.ok) return null;

          const authorJson = (await authorRes.json()) as {
            name?: string;
          };

          return authorJson.name ?? null;
        })
      );

      authors = authorNames.filter(Boolean) as string[];
    }

    const coverUrl =
      book.covers?.[0] != null
        ? `https://covers.openlibrary.org/b/id/${book.covers[0]}-L.jpg`
        : null;

    return {
      barcode,
      title: book.title,
      authors,
      description: null,
      published_year: parseYear(book.publish_date),
      cover_url: coverUrl,
      source: "open_library",
    };
  } catch {
    return null;
  }
}