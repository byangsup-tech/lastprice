/** deck-spec → pptx 빌드. 사용: npm run deck:build -- <spec.json> [--org=팩]
 *  validate를 선행하며 에러가 있으면 빌드하지 않는다. */
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import pptxgen from "pptxgenjs";
import { loadRules, themeOf } from "./lib/theme";
import { TEMPLATES } from "./lib/templates/index";
import { chrome, head, band, stamps, footnote, BODY, type SlideCtx } from "./lib/chrome";
import { loadSpec, printFindings, validateSpec } from "./validate";
import type { DeckSpec } from "./lib/types";

export async function buildDeck(spec: DeckSpec, specPath: string, orgOverride?: string): Promise<string> {
  const rules = loadRules(orgOverride || spec.meta.org);
  const theme = themeOf(rules);
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  if (spec.meta.author) pres.author = spec.meta.author;
  pres.title = spec.meta.title;

  spec.slides.forEach((s, i) => {
    const tpl = TEMPLATES[s.template];
    if (!tpl) throw new Error(`알 수 없는 템플릿: ${s.template}`);
    const slide = pres.addSlide();
    const ctx: SlideCtx = { pres, slide, theme, num: i + 1, meta: spec.meta };
    if (!tpl.isCover) {
      chrome(ctx, s);
      head(ctx, s);
      if (s.band) band(ctx, { x: BODY.x, y: BODY.bandY, w: BODY.w, text: s.band });
    }
    tpl.render(ctx, s);
    if (s.stamps?.length) stamps(ctx, s.stamps);
    if (s.footnote) footnote(ctx, s.footnote);
    if (s.notes) slide.addNotes(s.notes);
  });

  const outPath = join(dirname(resolve(specPath)), spec.meta.fileName);
  await pres.writeFile({ fileName: outPath });
  return outPath;
}

// ── CLI ──
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const orgArg = process.argv.slice(2).find((a) => a.startsWith("--org="))?.slice(6);
  if (!args[0]) {
    console.error("사용법: npm run deck:build -- <spec.json> [--org=팩]");
    process.exit(2);
  }
  const spec = loadSpec(args[0]);
  const rules = loadRules(orgArg || spec.meta?.org);
  console.log(`spec: ${args[0]}  |  org 팩: ${rules.org}  |  rules v${rules.rulesVersion}\n`);
  const { errors } = printFindings(validateSpec(spec, rules));
  if (errors > 0) {
    console.error("\n검증 에러가 있어 빌드하지 않음. 수정 후 재시도.");
    process.exit(1);
  }
  buildDeck(spec, args[0], orgArg)
    .then((out) => console.log(`\n빌드 완료: ${out}`))
    .catch((e) => {
      console.error("빌드 실패:", e);
      process.exit(1);
    });
}
