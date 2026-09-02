/** 유튜브 롱폼 자동화 파이프라인 — 공용 타입 (모든 모듈이 이 계약을 따른다) */

export type StageKey =
  | "research"
  | "script"
  | "voice"
  | "visuals"
  | "render"
  | "thumbnail"
  | "upload";

export const STAGES: StageKey[] = [
  "research",
  "script",
  "voice",
  "visuals",
  "render",
  "thumbnail",
  "upload",
];

export const STAGE_LABELS: Record<StageKey, string> = {
  research: "리서치",
  script: "대본",
  voice: "음성",
  visuals: "시각자료",
  render: "영상 합성",
  thumbnail: "썸네일",
  upload: "업로드",
};

export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StageState {
  status: StageStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  /** 진행 메모 (예: "skip (exists)", "썸네일 업로드 실패 — 비치명") */
  note?: string;
}

// ── 채널 프로필 ─────────────────────────────────────────────

export type VisualMode = "auto" | "cards" | "photos" | "videos";

export interface ChannelProfile {
  name: string;
  niche: string;
  audience: string;
  tone: string;
  language: "ko";
  /** 관심 주제 키워드 — 리서치 적합도 계산 + 뉴스 검색어 */
  keywords: string[];
  /** 제외 키워드 — 하나라도 걸리면 후보 점수 0 */
  avoid: string[];
  /** 목표 길이(분) 8~15 */
  targetMinutes: number;
  /** TTS 보이스 (Edge: ko-KR-InJoonNeural / ko-KR-SunHiNeural) */
  voice: string;
  /** TTS 속도 (Edge prosody rate, 예 "+5%") */
  voiceRate: string;
  theme: {
    primary: string;
    accent: string;
    background: string;
    text: string;
    fontFamily?: string;
  };
  /** 아웃트로 멘트 */
  cta: string;
  /** 로컬 BGM mp3 경로 (없으면 BGM 없음) */
  bgmPath?: string | null;
  /** auto: PEXELS 키가 있으면 photos, 없으면 cards */
  visualMode: VisualMode;
  brand?: { watermark?: string };
}

// ── 리서치 ───────────────────────────────────────────────────

export type ResearchSourceId =
  | "google-trends"
  | "google-news"
  | "suggest-yt"
  | "suggest-web"
  | "wikipedia"
  | "youtube-data"
  | "naver-news"
  | "naver-datalab"
  | "llm-rerank";

export interface CandidateEvidence {
  source: ResearchSourceId;
  label: string;
  url?: string;
  value?: string;
}

export interface CandidateNews {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
}

export interface CandidateSignals {
  /** 검색·조회 수요 0..1 */
  demand: number;
  /** 경쟁 여유 0..1 (1 = 경쟁 낮음, 모르면 0.5) */
  competition: number;
  /** 채널 적합도 0..1 */
  fit: number;
  /** 신선도 0..1 */
  freshness: number;
}

export interface TopicCandidate {
  /** hashId(normalizeKey(title)) */
  id: string;
  title: string;
  /** LLM 제안 앵글 */
  angle?: string;
  /** LLM 제안 영상 제목 */
  suggestedTitle?: string;
  keywords: string[];
  sources: CandidateEvidence[];
  news: CandidateNews[];
  signals: CandidateSignals;
  /** 0..100 */
  score: number;
  /** 사람이 읽는 근거 */
  reasons: string[];
}

/** 소스 수집기가 반환하는 원시 신호 — score.ts가 병합·점수화 */
export interface RawSignal {
  source: ResearchSourceId;
  keyword: string;
  evidence: CandidateEvidence;
  news?: CandidateNews[];
  demand?: number;
  freshness?: number;
  competition?: number;
  fit?: number;
}

export interface ResearchSourceState {
  id: ResearchSourceId;
  name: string;
  status: "live" | "stale" | "error" | "no-key" | "skipped";
  count: number;
  error?: string;
  fetchedAt?: string;
}

export interface ResearchReport {
  generatedAt: string;
  profileName: string;
  candidates: TopicCandidate[];
  sources: ResearchSourceState[];
  llmRerank: "on" | "no-key" | "error" | "off";
}

/** 리서치 API 응답 — 캐시 상태 포함 */
export type ResearchResponse = ResearchReport & { cacheStatus: "live" | "stale" };

export interface Topic {
  title: string;
  angle?: string;
  keywords: string[];
  sourceUrls: string[];
  candidateId?: string;
  news?: CandidateNews[];
}

// ── 대본 ─────────────────────────────────────────────────────

export type SceneLayout =
  | "title"
  | "chapter"
  | "bullets"
  | "stat"
  | "quote"
  | "plain"
  | "outro";

export interface Scene {
  /** "s01" */
  id: string;
  /** 0-based 전체 순번 */
  index: number;
  /** 챕터 순번, 훅/아웃트로는 -1 */
  chapterIndex: number;
  chapterTitle?: string;
  layout: SceneLayout;
  /** 나레이션 (TTS 입력) 2~4문장 40~160자 */
  narration: string;
  /** 화면 큰 글씨 ≤ 24자 */
  heading?: string;
  /** ≤ 4개, 각 ≤ 28자 */
  bullets?: string[];
  stat?: { value: string; label: string };
  quote?: { text: string; by?: string };
  /** 영문 명사 2~4개 (스톡 검색) */
  visualKeywords: string[];
}

export interface Script {
  version: 1;
  topic: Topic;
  /** ≤ 60자 권장 (유튜브 제한 100자) */
  title: string;
  altTitles: string[];
  /** 본문 — 챕터 타임라인은 렌더 후 metadata.json에서 합성 */
  description: string;
  /** ≤ 15개, 각 ≤ 30자, 합계 ≤ 400자 */
  tags: string[];
  thumbnail: { headline: string; sub?: string };
  /** 순서 = chapterIndex */
  chapters: { title: string }[];
  /** hook(title) → chapter 카드/본문 → outro */
  scenes: Scene[];
  /** 참고 URL */
  sources: string[];
  estimatedMinutes: number;
  generator: "anthropic" | "template";
  model?: string;
}

// ── 음성·자막·타임라인 ───────────────────────────────────────

export interface WordTiming {
  text: string;
  startMs: number;
  endMs: number;
}

export interface SceneAudio {
  sceneId: string;
  /** 절대 경로 */
  file: string;
  /** 사용할 길이 = min(파일 길이, 마지막 단어 끝 + 250ms) — 꼬리 무음 제거 */
  durationMs: number;
  /** 원본 파일 길이 */
  fileDurationMs?: number;
  words: WordTiming[];
  /** 캐시 무효화용 나레이션 해시 */
  narrationHash?: string;
  provider?: TtsProvider;
  voice?: string;
}

/** 장면 뒤 여백 (ms) — 클립 길이 = 나레이션 + 패드 */
export const SCENE_PAD_MS = 350;

export interface Timeline {
  scenes: { sceneId: string; startMs: number; endMs: number }[];
  totalMs: number;
}

export interface Caption {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export type TtsProvider = "edge" | "openai" | "elevenlabs";
export type LlmProvider = "anthropic" | "template";

// ── 시각자료·렌더 ────────────────────────────────────────────

export type KenBurns = "in" | "out" | "left" | "right";

export interface FramePlanScene {
  sceneId: string;
  kind: "image" | "video";
  /** kind=image: 렌더된 카드 PNG (스톡 사진 배경 포함) */
  imagePath?: string;
  /** kind=video: 스톡 영상 mp4 */
  videoPath?: string;
  /** kind=video: 알파 PNG 오버레이 */
  overlayPath?: string;
  durationMs: number;
  kenBurns: KenBurns;
  credit?: { photographer?: string; url?: string; provider: "pexels" };
}

export interface FramePlan {
  mode: Exclude<VisualMode, "auto">;
  scenes: FramePlanScene[];
}

// ── 작업(Job) ────────────────────────────────────────────────

export interface JobOutputs {
  scriptPath?: string;
  metadataPath?: string;
  audioDir?: string;
  timelinePath?: string;
  framesDir?: string;
  srtPath?: string;
  videoPath?: string;
  durationMs?: number;
  thumbnailPath?: string;
  /** 음성 단계 실측 분당 글자 수 */
  measuredCharsPerMinute?: number;
  youtubeVideoId?: string;
  youtubeUrl?: string;
}

export type Privacy = "private" | "unlisted" | "public";

export interface JobOptions {
  upload: boolean;
  privacy: Privacy;
  /** ISO 8601 — 설정 시 privacy는 private이어야 함 (유튜브 규칙) */
  publishAt?: string;
  visualMode?: VisualMode;
  /** 하단 진행 바 (기본 true) */
  progressBar?: boolean;
}

export interface Job {
  /** YYYYMMDD-HHmm-<hash6> (KST) */
  id: string;
  createdAt: string;
  updatedAt: string;
  topic: Topic;
  /** 생성 시점 프로필 스냅샷 */
  profile: ChannelProfile;
  stages: Record<StageKey, StageState>;
  outputs: JobOutputs;
  options: JobOptions;
  demo?: boolean;
}

export interface VideoMetadata {
  title: string;
  description: string;
  tags: string[];
  chapters: { title: string; startMs: number }[];
  durationMs?: number;
  /** "27" 교육(기본) · "25" 뉴스/정치 · "22" 인물/블로그 · "28" 과학기술 */
  categoryId: string;
  language: "ko";
  credits?: string[];
}

// ── 환경 상태 ────────────────────────────────────────────────

export interface ToolStatus {
  ok: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export interface EnvStatus {
  keys: Record<
    | "anthropic"
    | "youtubeData"
    | "youtubeUpload"
    | "pexels"
    | "naver"
    | "openaiTts"
    | "elevenlabs",
    boolean
  >;
  tools: {
    ffmpeg: ToolStatus;
    chromium: ToolStatus;
    fonts: ToolStatus & { family?: string; dir?: string };
  };
  llmProvider: LlmProvider;
  llmModel: string;
  ttsProvider: TtsProvider;
  ttsVoice: string;
  visualMode: Exclude<VisualMode, "auto">;
  localRunAllowed: boolean;
  checkedAt: string;
}

// ── 대시보드 API 응답 ────────────────────────────────────────

export interface JobSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  stages: Record<StageKey, StageStatus>;
  hasVideo: boolean;
  hasThumbnail: boolean;
  youtubeUrl?: string;
  demo?: boolean;
  running: boolean;
}

export interface JobDetailResponse {
  job: Job;
  script: Script | null;
  metadata: VideoMetadata | null;
  timeline: Timeline | null;
  logTail: string[];
  files: { name: string; size: number }[];
  running: boolean;
}
