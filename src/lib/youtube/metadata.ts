import type { Script, VideoMetadata } from "./types";

/**
 * 유튜브 메타데이터 정제 — videos.insert가 거부하는 값을 미리 걸러낸다.
 * - 제목·설명·태그에 '<' '>' 금지
 * - 제목 ≤ 100자, 설명 ≤ 5000바이트(UTF-8), 태그 ≤ 15개 & Σ(len + 공백 포함 시 2) ≤ 480
 * generate.ts(대본 저장 시)와 upload(업로드 직전) 양쪽에서 호출한다.
 */

export const YT_TITLE_MAX = 100;
export const YT_DESCRIPTION_MAX_BYTES = 5000;
export const YT_TAGS_MAX = 15;
export const YT_TAGS_TOTAL_MAX = 480;

function stripAngle(s: string): string {
  return s.replace(/[<>]/g, "");
}

export function sanitizeTitle(title: string): { value: string; changed: boolean } {
  let t = stripAngle(title).replace(/\s+/g, " ").trim();
  let changed = t !== title.trim();
  if (t.length > YT_TITLE_MAX) {
    const cut = t.slice(0, YT_TITLE_MAX - 1);
    const sp = cut.lastIndexOf(" ");
    t = (sp > YT_TITLE_MAX * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
    changed = true;
  }
  return { value: t || "제목 없음", changed };
}

/** 설명을 바이트 상한까지 줄 단위로 자르되 '타임라인' 블록은 보존 (본문을 먼저 자름) */
export function sanitizeDescription(description: string): { value: string; changed: boolean } {
  const cleaned = stripAngle(description).replace(/\r\n/g, "\n").trim();
  if (Buffer.byteLength(cleaned, "utf8") <= YT_DESCRIPTION_MAX_BYTES) {
    return { value: cleaned, changed: cleaned !== description };
  }
  const idx = cleaned.indexOf("\n\n타임라인\n");
  const body = idx >= 0 ? cleaned.slice(0, idx) : cleaned;
  const tail = idx >= 0 ? cleaned.slice(idx) : "";
  const tailBytes = Buffer.byteLength(tail, "utf8");
  const budget = Math.max(200, YT_DESCRIPTION_MAX_BYTES - tailBytes - 4);
  const lines = body.split("\n");
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const bytes = Buffer.byteLength(line, "utf8") + 1;
    if (used + bytes > budget) break;
    kept.push(line);
    used += bytes;
  }
  let trimmedBody = kept.join("\n").trimEnd();
  if (!trimmedBody) {
    // 첫 줄 자체가 너무 길면 바이트 기준으로 자른다
    trimmedBody = Buffer.from(body, "utf8").subarray(0, budget).toString("utf8").replace(/�+$/g, "");
  }
  const value = (trimmedBody + (trimmedBody.length < body.length ? "\n…" : "") + tail).trim();
  return { value, changed: true };
}

export function sanitizeTags(tags: string[]): { value: string[]; changed: boolean } {
  const seen = new Set<string>();
  const out: string[] = [];
  let total = 0;
  let changed = false;
  for (const raw of tags) {
    const t = stripAngle(raw).replace(/\s+/g, " ").trim();
    if (!t || t.length > 100) {
      changed = true;
      continue;
    }
    const key = t.toLowerCase();
    if (seen.has(key)) {
      changed = true;
      continue;
    }
    const cost = t.length + (t.includes(" ") ? 2 : 0);
    if (out.length >= YT_TAGS_MAX || total + cost > YT_TAGS_TOTAL_MAX) {
      changed = true;
      break;
    }
    if (t !== raw) changed = true;
    seen.add(key);
    out.push(t);
    total += cost;
  }
  return { value: out, changed };
}

export function sanitizeMetadata(meta: VideoMetadata): { meta: VideoMetadata; notes: string[] } {
  const notes: string[] = [];
  const title = sanitizeTitle(meta.title);
  if (title.changed) notes.push(`제목 정제 (${meta.title.length}자 → ${title.value.length}자)`);
  const description = sanitizeDescription(meta.description);
  if (description.changed) {
    notes.push(
      `설명 정제 (${Buffer.byteLength(meta.description, "utf8")}B → ${Buffer.byteLength(description.value, "utf8")}B)`,
    );
  }
  const tags = sanitizeTags(meta.tags);
  if (tags.changed) notes.push(`태그 정제 (${meta.tags.length}개 → ${tags.value.length}개)`);
  return {
    meta: { ...meta, title: title.value, description: description.value, tags: tags.value },
    notes,
  };
}

/** 대본 → 초기 메타데이터 (챕터 타임라인은 렌더 후 applyChapters로 채움) */
export function buildInitialMetadata(script: Script, categoryId = "27"): VideoMetadata {
  return sanitizeMetadata({
    title: script.title,
    description: script.description,
    tags: script.tags,
    chapters: [],
    categoryId,
    language: "ko",
  }).meta;
}
