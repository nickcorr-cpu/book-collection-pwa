import { NextResponse } from "next/server";

type SearchResult = {
  title: string;
  url: string;
  description: string | null;
  cover_url: string | null;
  source: "web_search";
};

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function stripTags(html: string) {
  return html.replace(/<[^>]*>/g, "");
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

function resolveDuckDuckGoUrl(href: string) {
  try {
    const resolved = new URL(href, "https://html.duckduckgo.com");
    const uddg = resolved.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return resolved.toString();
  } catch {
    return href;
  }
}

async function fetchPageMetadata(url: string): Promise<Partial<SearchResult> | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    const title =
      metaContent(html, ["og:title", "twitter:title"]) ??
      cleanText(html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]) ??
      null;

    if (!title) return null;

    const description =
      metaContent(html, ["og:description", "description", "twitter:description"]) ?? null;

    const image =
      metaContent(html, ["og:image", "twitter:image"]) ?? null;

    return {
      title,
      description,
      cover_url: image,
    };
  } catch {
    return null;
  }
}

async function duckDuckGoSearch(query: string) {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) return [];

  const html = await res.text();
  const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

  return matches.slice(0, 5).map((match) => ({
    url: resolveDuckDuckGoUrl(match[1]),
    title: cleanText(stripTags(match[2])),
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = cleanText(searchParams.get("query"));

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  try {
    const searchResults = await duckDuckGoSearch(query);
    const results: SearchResult[] = [];

    for (const result of searchResults) {
      const meta = await fetchPageMetadata(result.url);
      if (!meta?.title) continue;

      results.push({
        title: meta.title || result.title,
        url: result.url,
        description: meta.description ?? null,
        cover_url: meta.cover_url ?? null,
        source: "web_search",
      });
    }

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] }, { status: 200 });
  }
}