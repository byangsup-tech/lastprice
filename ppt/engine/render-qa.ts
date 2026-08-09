/** 렌더 QA — pptx → PDF → 슬라이드 PNG. 사용: npm run deck:qa -- <pptx>
 *  soffice(LibreOffice)·pdftoppm(Poppler)을 탐지해 있으면 렌더, 없으면 텍스트 추출 폴백 후
 *  "렌더 미수행"을 명시한다 (렌더 층위 결함 — 충돌·가림·잘림 — 은 렌더로만 검출됨). */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PPT_ROOT } from "./lib/theme";

function has(cmd: string): boolean {
  return spawnSync("which", [cmd], { encoding: "utf-8" }).status === 0;
}

function run(cmd: string, args: string[], timeoutMs = 180_000): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { encoding: "utf-8", timeout: timeoutMs });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

export function renderQa(pptxPath: string): void {
  const abs = resolve(pptxPath);
  if (!existsSync(abs)) {
    console.error(`파일 없음: ${abs}`);
    process.exit(2);
  }
  const dir = dirname(abs);
  const stem = basename(abs).replace(/\.pptx$/i, "");
  const outDir = join(dir, "qa");

  const soffice = ["soffice", "libreoffice"].find(has);
  const ppm = has("pdftoppm");

  let rendered = false;
  if (soffice) {
    console.log(`렌더: ${soffice}로 PDF 변환 중...`);
    const conv = run(soffice, ["--headless", "--convert-to", "pdf", "--outdir", dir, abs]);
    const pdf = join(dir, `${stem}.pdf`);
    if (conv.ok && existsSync(pdf)) {
      if (ppm) {
        mkdirSync(outDir, { recursive: true });
        const p = run("pdftoppm", ["-jpeg", "-r", "120", pdf, join(outDir, "slide")]);
        if (p.ok) {
          const imgs = readdirSync(outDir).filter((f) => f.startsWith("slide") && f.endsWith(".jpg")).sort();
          rendered = imgs.length > 0;
          if (rendered) {
            console.log(`렌더 완료 — 슬라이드 이미지 ${imgs.length}장:`);
            for (const f of imgs) console.log(`  ${join(outDir, f)}`);
            console.log("\n다음 단계: 이미지를 열어 육안 QA — ① 렌더 결함(텍스트 충돌·가림·잘림) ② 사다리 L1~L5 (rules/core/ladder.json)");
          }
        } else {
          console.error("pdftoppm 실패:", p.out.slice(0, 400));
        }
      } else {
        console.log(`PDF 생성됨: ${pdf} (pdftoppm 없음 — PDF를 직접 열어 육안 QA)`);
        rendered = true;
      }
    } else {
      console.error("PDF 변환 실패:", conv.out.slice(0, 400));
    }
  }

  if (!rendered) {
    console.log("\n⚠ 렌더 미수행 — soffice(LibreOffice) 또는 변환이 불가한 환경.");
    console.log("  렌더 층위 결함(텍스트 충돌·가림·잘림)은 이 환경에서 검증되지 않았음을 QA 보고에 명기할 것.");
    console.log("  폴백: 텍스트 추출로 내용·순서만 점검한다.\n");
    const py = ["python3", "python"].find(has);
    if (py) {
      const r = spawnSync(py, [join(PPT_ROOT, "engine", "extract-text.py"), abs], { encoding: "utf-8" });
      console.log(r.stdout ?? "");
      if (r.status !== 0) console.error(r.stderr ?? "");
    } else {
      console.log("python3도 없어 텍스트 추출 생략 — 다른 환경에서 deck:text 실행 권장.");
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!arg) {
    console.error("사용법: npm run deck:qa -- <pptx>");
    process.exit(2);
  }
  renderQa(arg);
}
