/** 유튜브 롱폼 파이프라인 — 타입에 의존하지 않는 공용 유틸 */

/** djb2 해시 → base36 (insurance/collect.ts와 같은 방식, id·중복 제거용) */
export function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 파일명·id용 슬러그 — 한글은 유지(NFC), 공백/특수문자는 '-' */
export function slugify(text: string, maxLen = 40): string {
  const s = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
  return s || "untitled";
}

/** 비교용 정규화: NFC, 소문자, 공백·구두점 제거 */
export function normalizeKey(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** 최대 길이로 자르고 말줄임표 */
export function clampText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

/** ms → SRT 타임스탬프 "HH:MM:SS,mmm" */
export function formatSrtTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const mm = total % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(mm, 3)}`;
}

/** ms → 유튜브 챕터 타임스탬프 "M:SS" 또는 "H:MM:SS" */
export function formatChapterTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** ms → 사람이 읽는 길이 "12분 34초" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

/** 한국어 문장 분리 — 종결 부호(. ? ! …) 뒤에서 자름, 소수점·숫자 사이는 유지 */
export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    buf += ch;
    if (/[.?!…]/.test(ch)) {
      const next = cleaned[i + 1];
      const prev = cleaned[i - 1];
      // "3.5" 같은 소수점은 문장 끝이 아님
      const isDecimal = ch === "." && /\d/.test(prev ?? "") && /\d/.test(next ?? "");
      if (!isDecimal && (next === undefined || next === " " || /["'”’)\]]/.test(next))) {
        // 닫는 따옴표·괄호는 문장에 포함
        let j = i + 1;
        while (j < cleaned.length && /["'”’)\]]/.test(cleaned[j])) {
          buf += cleaned[j];
          j++;
        }
        i = j - 1;
        out.push(buf.trim());
        buf = "";
      }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/** 나레이션 정리: 줄바꿈·마크다운·이모지 제거, 공백 정리, 종결 부호 보장 */
export function cleanNarration(text: string): string {
  let t = text
    .replace(/[*_`#>]+/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t && !/[.?!…]["'”’)\]]?$/.test(t)) t += ".";
  return t;
}

/** HTML 이스케이프 (템플릿 렌더링용) */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 0..1 범위로 고정 */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** KST 기준 시각 문자열 — job id 등에 사용 (YYYYMMDD-HHmm) */
export function kstStamp(date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const iso = kst.toISOString(); // 2026-09-02T02:34:56.000Z (KST로 시프트됨)
  return `${iso.slice(0, 10).replace(/-/g, "")}-${iso.slice(11, 16).replace(":", "")}`;
}

/** 장면 파일 번호 (1-based, 항상 3자리: scene-001) — readdir 정렬·라우트 정규식과 일치 */
export function sceneNo(index: number): string {
  return String(index + 1).padStart(3, "0");
}

/** 단순 .env 파일 파서 — tsx 스크립트에서 .env.local을 읽을 때 사용 (이미 설정된 변수는 덮어쓰지 않음) */
export function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out[key] = value;
  }
  return out;
}
