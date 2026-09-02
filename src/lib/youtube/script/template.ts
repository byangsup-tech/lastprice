import type { CandidateNews, ChannelProfile, Script, Topic } from "../types";
import { clampText } from "../util";
import { validateScript, type LlmScene, type LlmScriptOutput } from "./schema";

/**
 * 템플릿 모드 대본 생성기 — LLM 키가 없거나 YT_LLM_PROVIDER=template일 때.
 * 주제 제목 + 뉴스 헤드라인으로 3챕터짜리 짧은 초안(2~3분)을 만든다.
 * 실제 채널 운영용 대본은 Anthropic 모드를 쓰고, 템플릿 결과는 파이프라인 검증·초안 용도임을 UI에 표시한다.
 */

function headlineList(news: CandidateNews[] | undefined, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of news ?? []) {
    // "제목 - 매체" 꼬리 제거
    const t = n.title.replace(/\s+-\s+[^-]+$/, "").replace(/\s+/g, " ").trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function josa(word: string, withBatchim: string, without: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return without;
  return (last - 0xac00) % 28 === 0 ? without : withBatchim;
}

export interface TemplateInput {
  topic: Topic;
  profile: ChannelProfile;
  targetMinutes?: number;
}

export function buildTemplateOutput({ topic, profile }: TemplateInput): LlmScriptOutput {
  const t = topic.title.trim();
  const headlines = headlineList(topic.news, 6);
  const eun = josa(t, "은", "는");
  const eul = josa(t, "을", "를");
  const kw = profile.keywords.slice(0, 3).join(", ");
  const asciiKeywords = topic.keywords.filter((k) => /^[\x20-\x7e]+$/.test(k)).slice(0, 3);
  const baseKeywords = asciiKeywords.length ? asciiKeywords : ["korea", "business", "finance"];

  const hook: LlmScene = {
    layout: "title",
    narration: `${t}${eun} 요즘 검색과 뉴스에서 가장 자주 보이는 키워드 중 하나입니다. 무엇이 달라졌고, 우리에게 어떤 영향이 있는지, 그리고 지금 무엇을 확인해야 하는지 이 영상 하나로 정리해 드립니다.`,
    heading: t,
    bullets: null,
    stat: null,
    quote: null,
    visualKeywords: baseKeywords,
  };

  const chapter1Scenes: LlmScene[] = [
    {
      layout: "chapter",
      narration: `먼저 최근 흐름부터 보겠습니다. ${t} 관련 소식은 짧은 기간에 여러 매체에서 동시에 다뤄졌습니다. 핵심 내용을 순서대로 짚어 보겠습니다.`,
      heading: "무슨 일이 있었나",
      bullets: null,
      stat: null,
      quote: null,
      visualKeywords: ["news", "newspaper", "headline"],
    },
  ];
  if (headlines.length) {
    const first = headlines.slice(0, 4);
    chapter1Scenes.push({
      layout: "bullets",
      narration:
        `주요 보도를 보면 ${first.map((h, i) => `${i + 1}번째, ${clampText(h, 40)}`).join(". ")}. ` +
        `이렇게 여러 갈래의 소식이 한꺼번에 나오면서 관심이 빠르게 커졌습니다.`,
      heading: "최근 주요 보도",
      bullets: first.map((h) => clampText(h, 28)),
      stat: null,
      quote: null,
      visualKeywords: ["news", "media", "report"],
    });
  } else {
    chapter1Scenes.push({
      layout: "plain",
      narration: `${t}${eun} 아직 정리된 보도가 많지 않은 초기 단계의 주제입니다. 그래서 오히려 지금 기본 개념과 배경을 잡아 두면 앞으로 나올 소식을 훨씬 빠르게 이해할 수 있습니다.`,
      heading: "지금 알아둘 배경",
      bullets: null,
      stat: null,
      quote: null,
      visualKeywords: ["background", "concept", "study"],
    });
  }

  const chapter2Scenes: LlmScene[] = [
    {
      layout: "chapter",
      narration: `그렇다면 이 변화가 왜 중요할까요. ${profile.audience}의 입장에서 체감할 수 있는 부분을 중심으로 살펴보겠습니다.`,
      heading: "왜 중요한가",
      bullets: null,
      stat: null,
      quote: null,
      visualKeywords: ["question", "analysis", "chart"],
    },
    {
      layout: "stat",
      narration: `이번 리서치에서 ${t} 관련 기사와 검색 신호는 ${Math.max(headlines.length, 1)}건 이상 확인됐습니다. 숫자 자체보다 중요한 것은 방향입니다. 관심이 늘어나는 주제는 제도나 상품이 뒤따라 바뀌는 경우가 많기 때문입니다.`,
      heading: "관심의 방향",
      bullets: null,
      stat: { value: `${Math.max(headlines.length, 1)}+`, label: "최근 관련 보도·신호" },
      quote: null,
      visualKeywords: ["statistics", "growth", "trend"],
    },
    {
      layout: "plain",
      narration: `특히 ${kw}처럼 생활과 직결된 영역은 작은 변화도 비용과 선택에 바로 영향을 줍니다. 그래서 ${t}${eul} 단순한 뉴스가 아니라 내 상황에 대입해서 볼 필요가 있습니다.`,
      heading: "내 상황에 대입하기",
      bullets: null,
      stat: null,
      quote: null,
      visualKeywords: ["family", "planning", "calculator"],
    },
  ];

  const chapter3Scenes: LlmScene[] = [
    {
      layout: "chapter",
      narration: `마지막으로 앞으로 무엇을 확인하면 좋을지 정리하겠습니다. 세 가지만 기억하시면 됩니다.`,
      heading: "앞으로 체크할 것",
      bullets: null,
      stat: null,
      quote: null,
      visualKeywords: ["checklist", "notebook", "plan"],
    },
    {
      layout: "bullets",
      narration: `첫째, 공식 발표와 원문을 직접 확인하세요. 둘째, 나에게 적용되는 조건과 시점을 메모해 두세요. 셋째, 비교할 수 있는 대안이 있는지 살펴보세요. 이 세 가지만 지켜도 잘못된 정보에 휘둘릴 가능성이 크게 줄어듭니다.`,
      heading: "체크리스트 3가지",
      bullets: ["공식 발표·원문 확인", "내게 적용되는 조건과 시점", "비교 가능한 대안 살피기"],
      stat: null,
      quote: null,
      visualKeywords: ["checklist", "office", "desk"],
    },
    {
      layout: "quote",
      narration: `정보는 빠르게 바뀌지만, 확인하는 습관은 오래 갑니다. ${t}에 대한 새로운 소식이 나오면 이 채널에서 다시 정리해 드리겠습니다.`,
      heading: null,
      bullets: null,
      stat: null,
      quote: { text: "정보는 빠르게 바뀌지만, 확인하는 습관은 오래 간다", by: profile.name },
      visualKeywords: ["sunrise", "road", "future"],
    },
  ];

  const outro: LlmScene = {
    layout: "outro",
    narration: profile.cta,
    heading: "구독 · 좋아요 · 알림",
    bullets: null,
    stat: null,
    quote: null,
    visualKeywords: ["subscribe", "thank you", "audience"],
  };

  const hashtags = [t, ...profile.keywords.slice(0, 2)]
    .map((k) => "#" + k.replace(/\s+/g, ""))
    .join(" ");
  const description =
    `${t}${eun} 무엇이고 왜 중요한지, 최근 보도와 함께 정리했습니다.\n\n` +
    (headlines.length ? `참고한 보도\n${headlines.map((h) => `· ${h}`).join("\n")}\n\n` : "") +
    `※ 이 대본은 템플릿 모드로 생성된 초안입니다. ANTHROPIC_API_KEY를 설정하면 주제에 맞춘 상세 대본이 생성됩니다.\n\n${hashtags}`;

  return {
    title: clampText(`${t}, 지금 꼭 알아야 할 핵심 정리`, 60),
    altTitles: [clampText(`${t} 한 번에 이해하기`, 60), clampText(`${t} 최근 소식과 체크포인트`, 60), clampText(`${t}, 무엇이 달라졌나`, 60)],
    description,
    tags: [...new Set([t, ...topic.keywords, ...profile.keywords.slice(0, 5)])].slice(0, 15),
    thumbnail: { headline: clampText(t, 12), sub: "핵심 정리" },
    hook,
    chapters: [
      { title: "무슨 일이 있었나", scenes: chapter1Scenes },
      { title: "왜 중요한가", scenes: chapter2Scenes },
      { title: "앞으로 체크할 것", scenes: chapter3Scenes },
    ],
    outro,
    sources: [...new Set([...(topic.news ?? []).map((n) => n.url), ...topic.sourceUrls])].slice(0, 10),
  };
}

export function templateScript(input: TemplateInput): Script {
  return validateScript(buildTemplateOutput(input), {
    topic: input.topic,
    profile: input.profile,
    generator: "template",
  });
}

/** 오프라인 데모 (npm run yt -- demo) — 파이프라인 설명 6장면, 약 70초 */
export const DEMO_TOPIC: Topic = {
  title: "유튜브 롱폼 자동화 파이프라인",
  angle: "리서치부터 영상 제작까지 자동으로 이어지는 흐름 소개",
  keywords: ["automation", "youtube", "workflow"],
  sourceUrls: [],
  news: [],
};

export function demoScript(profile: ChannelProfile): Script {
  const kw = (a: string[]): string[] => a;
  const scene = (
    layout: LlmScene["layout"],
    narration: string,
    heading: string | null,
    extra: Partial<LlmScene> = {},
  ): LlmScene => ({
    layout,
    narration,
    heading,
    bullets: null,
    stat: null,
    quote: null,
    visualKeywords: kw(["technology", "studio", "video"]),
    ...extra,
  });
  const output: LlmScriptOutput = {
    title: "주제 리서치부터 영상까지, 유튜브 롱폼 자동화 데모",
    altTitles: ["유튜브 롱폼 자동화 파이프라인 데모", "리서치·대본·음성·영상을 한 번에"],
    description:
      "이 영상은 유튜브 롱폼 자동화 파이프라인이 만든 데모입니다. 리서치, 대본, 음성 합성, 시각 자료, 영상 합성, 썸네일까지 모든 단계가 자동으로 이어집니다.\n\n#자동화 #유튜브 #파이프라인",
    tags: ["유튜브 자동화", "롱폼", "파이프라인", "TTS", "ffmpeg"],
    thumbnail: { headline: "롱폼 자동화", sub: "리서치→영상" },
    hook: scene(
      "title",
      "안녕하세요. 지금 보고 계신 영상은 사람 손을 거치지 않고 만들어졌습니다. 주제 리서치부터 대본, 음성, 자막, 영상 합성까지 어떻게 이어지는지 1분 안에 보여 드리겠습니다.",
      "유튜브 롱폼 자동화",
      { visualKeywords: ["automation", "robot", "studio"] },
    ),
    chapters: [
      {
        title: "파이프라인 구조",
        scenes: [
          scene(
            "chapter",
            "파이프라인은 일곱 단계로 구성됩니다. 리서치, 대본, 음성, 시각자료, 영상 합성, 썸네일, 그리고 업로드입니다. 각 단계는 독립적으로 다시 실행할 수 있습니다.",
            "파이프라인 구조",
          ),
          scene(
            "bullets",
            "리서치 단계는 구글 트렌드와 뉴스, 유튜브 자동완성 같은 공개 신호를 모아 주제 후보에 점수를 매깁니다. 대본 단계는 선택된 주제로 훅과 챕터, 아웃트로가 있는 구조화된 대본을 만듭니다.",
            "리서치와 대본",
            {
              bullets: ["구글 트렌드·뉴스 RSS 수집", "수요·경쟁·적합도 점수화", "훅 → 챕터 → 아웃트로 대본"],
              visualKeywords: ["research", "data", "laptop"],
            },
          ),
          scene(
            "stat",
            "음성 단계는 장면마다 나레이션을 합성하고 단어 단위 타이밍을 받아 자막을 만듭니다. 이 데모의 나레이션은 마이크로소프트 엣지 음성으로 만들어졌고 별도의 비용이 들지 않았습니다.",
            "음성과 자막",
            { stat: { value: "0원", label: "이 데모의 음성 합성 비용" }, visualKeywords: ["microphone", "sound wave", "audio"] },
          ),
        ],
      },
      {
        title: "영상 합성",
        scenes: [
          scene(
            "chapter",
            "시각자료 단계는 장면 정보를 HTML 카드로 그려 크로미움으로 캡처합니다. 영상 합성 단계는 이 이미지들에 켄 번즈 효과를 주고 나레이션과 자막을 얹어 최종 영상을 만듭니다.",
            "영상 합성",
            { visualKeywords: ["film", "editing", "timeline"] },
          ),
        ],
      },
    ],
    outro: scene(
      "outro",
      profile.cta,
      "구독 · 좋아요 · 알림",
      { visualKeywords: ["thank you", "audience", "applause"] },
    ),
    sources: [],
  };
  return validateScript(output, { topic: DEMO_TOPIC, profile, generator: "template" });
}
