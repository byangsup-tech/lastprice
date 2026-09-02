import { loadProfile } from "./config";
import { createJob } from "./jobs";
import { DEMO_TOPIC } from "./script/template";
import type { ChannelProfile, Job } from "./types";

/**
 * 오프라인 데모 작업 — 키 없이 전체 파이프라인(대본→음성→시각자료→합성→썸네일)을 검증한다.
 * 대본은 템플릿(demoScript), 시각자료는 카드 모드, 업로드는 하지 않는다.
 */
export async function createDemoJob(profile?: ChannelProfile): Promise<Job> {
  const prof = profile ?? (await loadProfile());
  return createJob({
    topic: DEMO_TOPIC,
    profile: { ...prof, targetMinutes: 1 },
    demo: true,
    options: { upload: false, privacy: "private", visualMode: "cards" },
  });
}
