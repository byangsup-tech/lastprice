"use client";

import { useMemo, useState } from "react";
import { CHARS_PER_MINUTE } from "@/lib/youtube/script/schema";
import type { Scene, SceneLayout, Script } from "@/lib/youtube/types";

const LAYOUT_LABEL: Record<SceneLayout, string> = {
  title: "훅",
  chapter: "챕터",
  bullets: "불릿",
  stat: "수치",
  quote: "인용",
  plain: "본문",
  outro: "아웃트로",
};

const LAYOUT_TONE: Record<SceneLayout, string> = {
  title: "bg-teal-700 text-white",
  chapter: "bg-gray-800 text-white",
  bullets: "bg-sky-100 text-sky-800",
  stat: "bg-violet-100 text-violet-800",
  quote: "bg-amber-100 text-amber-800",
  plain: "bg-gray-100 text-gray-700",
  outro: "bg-emerald-100 text-emerald-800",
};

export interface ScriptStats {
  chars: number;
  estimatedMinutes: number;
  scenes: number;
}

/** 총 글자 수·예상 길이 (분당 400자 기준) */
export function scriptStats(script: Script, charsPerMinute = CHARS_PER_MINUTE): ScriptStats {
  const chars = script.scenes.reduce((n, s) => n + s.narration.length, 0);
  return {
    chars,
    estimatedMinutes: Math.round((chars / charsPerMinute) * 10) / 10,
    scenes: script.scenes.length,
  };
}

/** 챕터별 장면 그룹 — 인트로(-1, title) / 챕터 / 아웃트로 */
export function groupScenes(script: Script): { key: string; title: string; chapterIndex: number; scenes: Scene[] }[] {
  const groups: { key: string; title: string; chapterIndex: number; scenes: Scene[] }[] = [
    { key: "intro", title: "인트로 (훅)", chapterIndex: -1, scenes: [] },
    ...script.chapters.map((c, i) => ({ key: `ch${i}`, title: c.title, chapterIndex: i, scenes: [] as Scene[] })),
    { key: "outro", title: "아웃트로", chapterIndex: -2, scenes: [] },
  ];
  for (const s of script.scenes) {
    if (s.layout === "title" || (s.chapterIndex === -1 && s.layout !== "outro")) groups[0].scenes.push(s);
    else if (s.layout === "outro") groups[groups.length - 1].scenes.push(s);
    else groups[Math.min(groups.length - 2, Math.max(1, s.chapterIndex + 1))].scenes.push(s);
  }
  return groups.filter((g) => g.scenes.length);
}

interface Props {
  script: Script;
  targetMinutes: number;
  /** 저장(승인) — 검증 오류는 reasons로 반환 */
  onSave: (script: Script) => Promise<{ ok: true } | { ok: false; error: string; reasons: string[] }>;
  /** 실행 중·서버리스 등 편집 불가 */
  disabled?: boolean;
  disabledReason?: string;
}

/** 대본 미리보기·편집 — 제목/설명/썸네일 문구/태그/챕터명/장면별 heading·나레이션·불릿 */
export default function ScriptPreview({ script, targetMinutes, onSave, disabled, disabledReason }: Props) {
  // 서버 대본이 바뀌면(재생성·저장 후) 초안을 서버 버전으로 리셋 — 렌더 중 이전 값 비교 패턴 (effect 없음)
  const serverJson = useMemo(() => JSON.stringify(script), [script]);
  const [baseJson, setBaseJson] = useState(serverJson);
  const [draft, setDraft] = useState<Script>(script);
  if (serverJson !== baseJson) {
    setBaseJson(serverJson);
    setDraft(script);
  }
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const dirty = JSON.stringify(draft) !== baseJson;
  const stats = scriptStats(draft);
  const groups = groupScenes(draft);
  const overTarget = stats.estimatedMinutes > targetMinutes * 1.3;
  const underTarget = stats.estimatedMinutes < targetMinutes * 0.7;

  const patchScene = (index: number, patch: Partial<Scene>) =>
    setDraft((d) => ({ ...d, scenes: d.scenes.map((s) => (s.index === index ? { ...s, ...patch } : s)) }));
  const patchChapter = (ci: number, title: string) =>
    setDraft((d) => ({
      ...d,
      chapters: d.chapters.map((c, i) => (i === ci ? { title } : c)),
      scenes: d.scenes.map((s) =>
        s.chapterIndex === ci ? { ...s, chapterTitle: title, heading: s.layout === "chapter" ? title : s.heading } : s,
      ),
    }));

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const r = await onSave(draft);
      if (r.ok) {
        setSavedAt(Date.now());
      } else {
        setErrors(r.reasons.length ? r.reasons : [r.error]);
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "저장 실패"]);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-teal-500 disabled:bg-gray-50 disabled:text-gray-500";

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-gray-800">대본</h2>
        <span className="text-xs text-gray-500">
          {draft.generator === "anthropic" ? `Anthropic${draft.model ? ` · ${draft.model}` : ""}` : "템플릿 초안"} · 장면 {stats.scenes}개 · 챕터{" "}
          {draft.chapters.length}개
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            overTarget || underTarget ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
          }`}
          title={`분당 ${CHARS_PER_MINUTE}자 기준`}
        >
          총 {stats.chars.toLocaleString()}자 · 예상 {stats.estimatedMinutes}분 (목표 {targetMinutes}분)
        </span>
        <div className="ml-auto flex items-center gap-2">
          {dirty && !disabled && (
            <button
              type="button"
              onClick={() => setDraft(script)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-500"
            >
              되돌리기
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={disabled || saving || !dirty}
            title={disabled ? disabledReason : !dirty ? "변경 사항 없음" : "검증 후 script.json·metadata.json 저장, 이후 단계 초기화"}
            className="rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>

      {draft.generator === "template" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          템플릿 모드 초안입니다 — 파이프라인 검증용 품질입니다. <code className="rounded bg-amber-100 px-1">ANTHROPIC_API_KEY</code>를
          설정하고 대본을 다시 생성하면 LLM 대본으로 바뀝니다. 아래에서 직접 수정한 뒤 저장할 수도 있습니다.
        </p>
      )}
      {disabled && disabledReason && <p className="text-xs text-gray-400">{disabledReason}</p>}
      {errors.length > 0 && (
        <ul className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <li className="font-medium">검증 오류 — 저장되지 않았습니다</li>
          {errors.map((e, i) => (
            <li key={i}>· {e}</li>
          ))}
        </ul>
      )}
      {savedAt && !dirty && errors.length === 0 && (
        <p className="text-xs text-emerald-700">저장됨 — 이후 단계(음성·시각자료·영상)는 다시 실행해야 합니다</p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-gray-500">영상 제목 · {draft.title.length}자</span>
          <input
            value={draft.title}
            disabled={disabled}
            maxLength={100}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">썸네일 헤드라인 · ≤14자</span>
          <input
            value={draft.thumbnail.headline}
            disabled={disabled}
            maxLength={14}
            onChange={(e) => setDraft((d) => ({ ...d, thumbnail: { ...d.thumbnail, headline: e.target.value } }))}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">썸네일 보조 문구 · ≤18자</span>
          <input
            value={draft.thumbnail.sub ?? ""}
            disabled={disabled}
            maxLength={18}
            onChange={(e) => setDraft((d) => ({ ...d, thumbnail: { ...d.thumbnail, sub: e.target.value || undefined } }))}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-gray-500">설명 · {draft.description.length}자</span>
          <textarea
            value={draft.description}
            disabled={disabled}
            rows={4}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-gray-500">태그 (쉼표 구분) · {draft.tags.length}개</span>
          <input
            value={draft.tags.join(", ")}
            disabled={disabled}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                tags: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              }))
            }
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const isOpen = open[g.key] ?? (g.chapterIndex === -1 || g.chapterIndex === 0);
          const chars = g.scenes.reduce((n, s) => n + s.narration.length, 0);
          return (
            <div key={g.key} className="rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={isOpen}
                >
                  <span className={`text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
                  {g.chapterIndex >= 0 ? (
                    <span className="text-xs font-medium text-gray-400">{g.chapterIndex + 1}부</span>
                  ) : null}
                  <span className="truncate text-sm font-semibold text-gray-800">{g.title}</span>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    장면 {g.scenes.length} · {chars}자
                  </span>
                </button>
              </div>
              {isOpen && (
                <div className="flex flex-col gap-2 border-t border-gray-100 px-3 py-2">
                  {g.chapterIndex >= 0 && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-gray-500">챕터 제목 · ≤24자</span>
                      <input
                        value={draft.chapters[g.chapterIndex]?.title ?? ""}
                        disabled={disabled}
                        maxLength={24}
                        onChange={(e) => patchChapter(g.chapterIndex, e.target.value)}
                        className={inputCls}
                      />
                    </label>
                  )}
                  {g.scenes.map((s) => (
                    <SceneEditor key={s.id} scene={s} disabled={disabled} onPatch={(patch) => patchScene(s.index, patch)} inputCls={inputCls} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SceneEditor({
  scene,
  disabled,
  onPatch,
  inputCls,
}: {
  scene: Scene;
  disabled?: boolean;
  onPatch: (patch: Partial<Scene>) => void;
  inputCls: string;
}) {
  const isCard = scene.layout === "chapter";
  const secs = Math.round((scene.narration.length / CHARS_PER_MINUTE) * 60);
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        <span className="font-mono text-gray-400">{scene.id}</span>
        <span className={`rounded px-1.5 py-0.5 font-medium ${LAYOUT_TONE[scene.layout]}`}>{LAYOUT_LABEL[scene.layout]}</span>
        <span>
          {scene.narration.length}자 · 약 {secs}초
        </span>
        {scene.visualKeywords.length > 0 && (
          <span className="ml-auto truncate text-gray-400" title="스톡 검색어">
            🔍 {scene.visualKeywords.join(", ")}
          </span>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-1 gap-1.5">
        {!isCard && (
          <input
            value={scene.heading ?? ""}
            disabled={disabled}
            maxLength={30}
            placeholder="화면 큰 글씨 (선택, ≤24자)"
            onChange={(e) => onPatch({ heading: e.target.value || undefined })}
            className={`${inputCls} font-medium`}
          />
        )}
        <textarea
          value={scene.narration}
          disabled={disabled}
          rows={Math.min(6, Math.max(2, Math.ceil(scene.narration.length / 60)))}
          onChange={(e) => onPatch({ narration: e.target.value })}
          className={`${inputCls} resize-y leading-relaxed`}
        />
        {(scene.layout === "bullets" || (scene.bullets && scene.bullets.length > 0)) && (
          <textarea
            value={(scene.bullets ?? []).join("\n")}
            disabled={disabled}
            rows={Math.max(2, (scene.bullets ?? []).length)}
            placeholder="불릿 (한 줄에 하나, ≤4개)"
            onChange={(e) =>
              onPatch({
                bullets: e.target.value
                  .split("\n")
                  .map((b) => b.trim())
                  .filter(Boolean)
                  .slice(0, 4),
              })
            }
            className={`${inputCls} text-xs`}
          />
        )}
        {scene.stat && (
          <p className="text-xs text-gray-600">
            📊 <strong>{scene.stat.value}</strong> {scene.stat.label}
          </p>
        )}
        {scene.quote && (
          <p className="text-xs italic text-gray-600">
            “{scene.quote.text}”{scene.quote.by && <span className="not-italic text-gray-400"> — {scene.quote.by}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
