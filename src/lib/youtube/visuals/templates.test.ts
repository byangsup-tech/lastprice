import test from "node:test";
import assert from "node:assert/strict";
import type { Scene } from "../types";
import {
  THUMB_FONT_MAX,
  THUMB_FONT_MIN,
  darken,
  fitFontSize,
  fontFaceCss,
  renderSceneHtml,
  renderThumbnailHtml,
  splitThumbnailLines,
  thumbnailFontSize,
  type TemplateContext,
} from "./templates";

const ctx: TemplateContext = {
  theme: { primary: "#0f172a", accent: "#14b8a6", background: "#0b1220", text: "#f8fafc" },
  fonts: { family: "Noto Sans KR", regularPath: "/tmp/f/Noto Regular.ttf", boldPath: "/tmp/f/NotoBold.ttf" },
  watermark: "인사이트 채널",
  script: { title: "대본 제목", chapterCount: 3, estimatedMinutes: 9.6 },
  chapterCount: 3,
};

function scene(partial: Partial<Scene> & { layout: Scene["layout"] }): Scene {
  return {
    id: "s01",
    index: 0,
    chapterIndex: 0,
    chapterTitle: "챕터 제목",
    narration: "이것은 테스트 나레이션입니다. 두 번째 문장입니다.",
    visualKeywords: ["test"],
    ...partial,
  };
}

test("fitFontSize — 길이에 대해 단조 감소, [min,max] 고정", () => {
  let prev = Infinity;
  for (let len = 1; len <= 200; len++) {
    const s = fitFontSize(len, 120, 40, 3000);
    assert.ok(s <= prev, `len=${len}: ${s} > ${prev}`);
    assert.ok(s >= 40 && s <= 120);
    prev = s;
  }
  assert.equal(fitFontSize(0, 120, 40, 3000), 120);
  assert.equal(fitFontSize(1, 120, 40, 3000), 120);
  assert.equal(fitFontSize(1000, 120, 40, 3000), 40);
});

test("splitThumbnailLines — 7자 이하 한 줄, 공백 우선, 없으면 반으로", () => {
  assert.deepEqual(splitThumbnailLines("롱폼 자동화"), ["롱폼 자동화"]);
  assert.deepEqual(splitThumbnailLines("실손보험 개편 총정리"), ["실손보험", "개편 총정리"]);
  assert.deepEqual(splitThumbnailLines("실손보험료 인상 대응법"), ["실손보험료", "인상 대응법"]);
  assert.deepEqual(splitThumbnailLines("실손보험개편총정리"), ["실손보험개", "편총정리"]);
  assert.deepEqual(splitThumbnailLines("가나다라마바사 아자차카타파하"), ["가나다라마바사", "아자차카타파하"]);
  assert.deepEqual(splitThumbnailLines("   "), [""]);
  // 어떤 공백도 7자 조건을 못 맞추면 가운데에 가장 가까운 공백 (동률이면 앞쪽)
  assert.deepEqual(splitThumbnailLines("가나다라마바사아 자차 카타파하거너더"), ["가나다라마바사아", "자차 카타파하거너더"]);
});

test("thumbnailFontSize — min(150, floor(1160/maxLen)) ≥ 96", () => {
  assert.equal(thumbnailFontSize(["롱폼 자동화"]), THUMB_FONT_MAX);
  assert.equal(thumbnailFontSize(["가나다라마바사아자"]), Math.floor(1160 / 9)); // 128
  assert.equal(thumbnailFontSize(["가나다라마바사아자차카타파하"]), THUMB_FONT_MIN);
  assert.equal(thumbnailFontSize([""]), THUMB_FONT_MAX);
});

test("darken", () => {
  assert.equal(darken("#ffffff", 0.5), "#808080");
  assert.equal(darken("#000000", 0.5), "#000000");
  assert.equal(darken("nope", 0.5), "nope");
});

test("fontFaceCss — file:// URL 인코딩 + 굵기", () => {
  const css = fontFaceCss(ctx.fonts);
  assert.match(css, /font-family:"Noto Sans KR";src:url\("file:\/\/\/tmp\/f\/Noto%20Regular\.ttf"\);font-weight:400/);
  assert.match(css, /NotoBold\.ttf"\);font-weight:700/);
  assert.equal(fontFaceCss({ family: "sans-serif" }), "");
});

test("escaping — 텍스트의 HTML 특수문자는 항상 이스케이프", () => {
  const html = renderSceneHtml(
    scene({
      layout: "bullets",
      heading: `<script>alert("x")</script> & 'q'`,
      bullets: ["<b>bold</b>", "a & b"],
    }),
    { ...ctx, watermark: "<wm>" },
  );
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;"));
  assert.ok(html.includes("&lt;b&gt;bold&lt;/b&gt;"));
  assert.ok(html.includes("a &amp; b"));
  assert.ok(html.includes("&lt;wm&gt;"));
  assert.ok(!html.includes("<wm>"));
});

test("각 레이아웃이 자기 데이터를 렌더한다", () => {
  const title = renderSceneHtml(scene({ layout: "title", heading: "훅 제목", chapterIndex: -1, chapterTitle: undefined }), ctx);
  assert.ok(title.includes("훅 제목"));
  assert.ok(title.includes("챕터 3개 · 약 10분 요약"));
  assert.ok(title.includes("인사이트 채널"));

  const titleNoHeading = renderSceneHtml(scene({ layout: "title", heading: undefined, chapterIndex: -1 }), ctx);
  assert.ok(titleNoHeading.includes("대본 제목"));

  const chapter = renderSceneHtml(scene({ layout: "chapter", heading: "무슨 일이 있었나", chapterIndex: 1 }), ctx);
  assert.ok(chapter.includes("CHAPTER 02"));
  assert.ok(chapter.includes("2 / 3"));
  assert.ok(chapter.includes("무슨 일이 있었나"));

  const bullets = renderSceneHtml(scene({ layout: "bullets", heading: "체크리스트", bullets: ["하나", "둘", "셋", "넷", "다섯"] }), ctx);
  assert.ok(bullets.includes("체크리스트"));
  for (const b of ["하나", "둘", "셋", "넷"]) assert.ok(bullets.includes(`<span>${b}</span>`));
  assert.ok(!bullets.includes("<span>다섯</span>"), "최대 4개");
  assert.ok(bullets.includes("01 · 챕터 제목"));

  const stat = renderSceneHtml(scene({ layout: "stat", heading: "관심의 방향", stat: { value: "12%", label: "증가율" } }), ctx);
  assert.ok(stat.includes("12%"));
  assert.ok(stat.includes("증가율"));
  assert.ok(stat.includes("관심의 방향"));
  assert.ok(stat.includes("color:#14b8a6"));

  const quote = renderSceneHtml(scene({ layout: "quote", heading: undefined, quote: { text: "확인하는 습관", by: "채널" } }), ctx);
  assert.ok(quote.includes("확인하는 습관"));
  assert.ok(quote.includes("&mdash; 채널"));

  const plain = renderSceneHtml(scene({ layout: "plain", heading: undefined, narration: "가".repeat(100) }), ctx);
  assert.ok(plain.includes("가".repeat(59) + "…"), "heading 없으면 나레이션 60자");
  assert.ok(plain.includes("챕터 제목"));

  const outro = renderSceneHtml(scene({ layout: "outro", heading: "구독 · 좋아요 · 알림", narration: "감사합니다." }), ctx);
  assert.ok(outro.includes("구독 · 좋아요 · 알림"));
  assert.ok(outro.includes("감사합니다."));
  assert.ok(outro.includes("알림 설정"));
});

test("데이터 없는 stat/bullets 는 plain 으로 폴백", () => {
  const html = renderSceneHtml(scene({ layout: "stat", heading: "제목만", stat: undefined }), ctx);
  assert.ok(html.includes("제목만"));
  assert.ok(!html.includes("&mdash;"));
  const html2 = renderSceneHtml(scene({ layout: "bullets", heading: "제목만", bullets: [] }), ctx);
  assert.ok(!html2.includes("<ul"));
});

test("배경 이미지·오버레이 변형", () => {
  const withBg = renderSceneHtml(scene({ layout: "plain", heading: "배경" }), { ...ctx, bgImagePath: "/tmp/img/한글 사진.jpg" });
  assert.ok(withBg.includes(`<img class="bg" alt="" src="file:///tmp/img/%ED%95%9C%EA%B8%80%20%EC%82%AC%EC%A7%84.jpg">`));
  assert.ok(withBg.includes('class="shade"'));

  const overlay = renderSceneHtml(scene({ layout: "bullets", heading: "오버레이", bullets: ["a"] }), { ...ctx, overlay: true });
  assert.ok(overlay.includes("background:transparent;"));
  assert.ok(!overlay.includes('class="bg"'));
  assert.ok(!overlay.includes('class="glow"'));
  assert.ok(overlay.includes("rgba(8,12,24,.62)"), "텍스트 뒤 반투명 패널");

  const plainCard = renderSceneHtml(scene({ layout: "plain", heading: "카드" }), ctx);
  assert.ok(plainCard.includes("linear-gradient(135deg,#0f172a"));
  assert.ok(plainCard.includes('class="glow"'));
});

test("renderThumbnailHtml — 줄 나눔·폰트 크기·이스케이프·1280×720", () => {
  const html = renderThumbnailHtml({ headline: "실손보험 개편 총정리", sub: "<2026>", channelName: "채널" }, ctx);
  assert.ok(html.includes('id="headline">실손보험\n개편 총정리</div>'));
  assert.ok(html.includes(`font-size:${THUMB_FONT_MAX}px`), "가장 긴 줄 6자 → 150px 상한");
  const long = renderThumbnailHtml({ headline: "가나다라마바사아자차카타" }, ctx);
  assert.ok(long.includes('id="headline">가나다라마바\n사아자차카타</div>'));
  assert.ok(long.includes("font-size:150px"));
  assert.ok(html.includes("&lt;2026&gt;"));
  assert.ok(html.includes("width:1280px;height:720px"));
  assert.ok(html.includes("-webkit-text-stroke:6px"));
  assert.ok(html.includes("word-break:keep-all"));
  assert.ok(html.includes("white-space:pre-line"));
  const shrunk = renderThumbnailHtml({ headline: "롱폼 자동화" }, ctx, { fontSize: 121 });
  assert.ok(shrunk.includes("font-size:121px"));
  assert.ok(!shrunk.includes('id="sub"'));
});
