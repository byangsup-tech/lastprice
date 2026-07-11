/**
 * 의존성 없는 최소 RSS 2.0 / Atom 파서.
 * 잘 구성된 뉴스 피드만 대상으로 하며, 실패한 항목은 조용히 건너뛴다.
 */

export interface ParsedFeedItem {
  title: string;
  link: string;
  summary?: string;
  /** ISO 8601. 파싱 실패 시 undefined */
  publishedAt?: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => ENTITIES[name] ?? m);
}

export function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** 블록에서 <tag>내용</tag> 첫 매치의 내용을 꺼낸다 (네임스페이스 접두사 허용) */
function tagContent(block: string, tag: string): string | undefined {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${tag}>`,
    "i",
  );
  const m = block.match(re);
  return m ? m[1].trim() : undefined;
}

/** Atom의 <link href="..."/> — rel="alternate" 우선 */
function atomLink(block: string): string | undefined {
  const links = [...block.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const pick =
    links.find((l) => /rel=["']alternate["']/i.test(l)) ??
    links.find((l) => !/rel=/i.test(l)) ??
    links[0];
  const href = pick?.match(/href=["']([^"']+)["']/i);
  return href ? href[1] : undefined;
}

function toIso(dateText: string | undefined): string | undefined {
  if (!dateText) return undefined;
  const t = Date.parse(dateText.trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

export function parseFeed(xml: string): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  let blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi);
  const isAtom = !blocks;
  if (!blocks) blocks = xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi);
  if (!blocks) return items;

  for (const block of blocks) {
    const rawTitle = tagContent(block, "title");
    if (!rawTitle) continue;
    const title = decodeEntities(stripTags(stripCdata(rawTitle)));

    let link: string | undefined;
    if (isAtom) {
      link = atomLink(block);
    } else {
      const rawLink = tagContent(block, "link");
      link = rawLink ? decodeEntities(stripCdata(rawLink)) : atomLink(block);
    }
    if (!title || !link || !/^https?:\/\//.test(link)) continue;

    const rawSummary =
      tagContent(block, "description") ??
      tagContent(block, "summary") ??
      tagContent(block, "encoded"); // content:encoded
    const summary = rawSummary
      ? decodeEntities(stripTags(stripCdata(rawSummary))).slice(0, 300)
      : undefined;

    const publishedAt = toIso(
      tagContent(block, "pubDate") ??
        tagContent(block, "published") ??
        tagContent(block, "updated") ??
        tagContent(block, "date"), // dc:date
    );

    items.push({ title, link, summary, publishedAt });
  }
  return items;
}
