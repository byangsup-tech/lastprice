import { fetchJson } from "./http";
import type { ParsedFeedItem } from "./rss";

/**
 * PubMed E-utilities — 한국 대상 발생률·사망률·유병률 의학 논문 추적.
 * https://eutils.ncbi.nlm.nih.gov (무료, 키 불필요 — 초당 3회 제한이나
 * 15분 캐시 폴링이라 무관)
 *
 * esearch(최신순 id 검색) → esummary(제목·발행일) 2단 호출.
 */

const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

interface EsearchResponse {
  esearchresult?: { idlist?: string[] };
}

interface EsummaryItem {
  title?: string;
  /** "2026/07/03 00:00" */
  sortpubdate?: string;
  fulljournalname?: string;
}

interface EsummaryResponse {
  result?: Record<string, EsummaryItem | string[]>;
}

export async function fetchPubmedArticles(
  term: string,
  retmax = 15,
): Promise<ParsedFeedItem[]> {
  const search = await fetchJson<EsearchResponse>(
    `${ESEARCH}?db=pubmed&retmode=json&sort=date&retmax=${retmax}` +
      `&term=${encodeURIComponent(term)}`,
    {},
    12000,
  );
  const ids = search.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summary = await fetchJson<EsummaryResponse>(
    `${ESUMMARY}?db=pubmed&retmode=json&id=${ids.join(",")}`,
    {},
    12000,
  );
  const items: ParsedFeedItem[] = [];
  for (const id of ids) {
    const entry = summary.result?.[id];
    if (!entry || Array.isArray(entry) || !entry.title) continue;
    const t = entry.sortpubdate
      ? Date.parse(entry.sortpubdate.replace(/\//g, "-"))
      : NaN;
    items.push({
      title: `[PubMed] ${entry.title}${entry.fulljournalname ? ` — ${entry.fulljournalname}` : ""}`,
      link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : undefined,
    });
  }
  return items;
}
