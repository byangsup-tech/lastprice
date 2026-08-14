#!/usr/bin/env python3
"""벤치마크 프로브 — 새 부서 pptx에서 조직 팩 후보 신호를 추출한다 (부서 이동 절차 1단계).

사용: npm run pack:probe -- <덱1.pptx> [<덱2.pptx> ...]
출력: 각 파일 옆에 <파일>.probe.json (기계용) + stdout에 통합 마크다운 보고 (사람용)

stdlib만 사용 (extract-text.py 선례). 여기서 나온 것은 전부 '후보'다 —
종결어미·금칙·역할 매핑의 확정은 해석의 영역이라 Claude Code 초안(prompts/pack-draft.md) + 사람 승인 경로로 간다.
"""
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

EMU_PER_IN = 914400

# 문체 규정이 다루는 기호 후보 (default 팩의 allow·ban 목록 합집합 + 관찰 대상)
SYMBOLS = ["—", "–", "△", "▲", "▼", "·", "→", "✕", "○", "◎", "|", "~", "+", "*",
           "➊", "➋", "➌", "➍", "➎", "①", "②", "③", "④", "⑤"]


def texts_of(xml: str):
    return [t for t in re.findall(r"<a:t>([^<]*)</a:t>", xml)]


def classify_color(xml: str, pos: int) -> str:
    """srgbClr 출현 위치의 문맥 분류 — 직전 윈도에서 가장 가까운 마커로 판정."""
    win = xml[max(0, pos - 260):pos]
    marks = {"text": win.rfind("<a:rPr"), "line": win.rfind("<a:ln"), "hl": win.rfind("<a:highlight"),
             "fill": max(win.rfind("<p:spPr"), win.rfind("<p:bg"))}
    best = max(marks, key=lambda k: marks[k])
    return best if marks[best] >= 0 else "fill"


def probe(path: Path) -> dict:
    z = zipfile.ZipFile(path)
    names = z.namelist()
    slides = sorted((n for n in names if re.match(r"ppt/slides/slide\d+\.xml$", n)),
                    key=lambda n: int(re.search(r"\d+", n).group()))

    # 판형
    pres = z.read("ppt/presentation.xml").decode("utf-8")
    m = re.search(r'<p:sldSz cx="(\d+)" cy="(\d+)"', pres)
    w_in = round(int(m.group(1)) / EMU_PER_IN, 2) if m else None
    h_in = round(int(m.group(2)) / EMU_PER_IN, 2) if m else None

    colors = {"fill": Counter(), "text": Counter(), "line": Counter(), "hl": Counter()}
    fonts, sizes = Counter(), Counter()
    last1, last2 = Counter(), Counter()
    symbols = Counter()
    dash_prefix = 0
    lengths = []
    english = Counter()

    for sn in slides:
        xml = z.read(sn).decode("utf-8")
        for mm in re.finditer(r'<a:srgbClr val="([0-9A-Fa-f]{6})"', xml):
            colors[classify_color(xml, mm.start())][mm.group(1).upper()] += 1
        fonts.update(re.findall(r'typeface="([^"]+)"', xml))
        sizes.update(int(s) / 100 for s in re.findall(r'sz="(\d+)"', xml))
        for t in texts_of(xml):
            t = t.strip()
            if not t:
                continue
            for s in SYMBOLS:
                if s in t:
                    symbols[s] += t.count(s)
            if t.startswith("- "):
                dash_prefix += 1
            # 한글 서술 텍스트만 종결어미 후보로 (짧은 라벨·수치 제외)
            core = re.sub(r'[\s"\')\]]+$', "", re.sub(r"\([^()]*\)\s*$", "", t))
            if len(core) >= 8 and re.search(r"[가-힣]$", core):
                last1[core[-1]] += 1
                last2[core[-2:]] += 1
                lengths.append(len(core))
            for tok in re.findall(r"\b[A-Z][A-Z ]{2,}\b", t):
                english[tok.strip()] += 1

    lengths.sort()
    return {
        "file": str(path),
        "slides": len(slides),
        "canvas": {"w_in": w_in, "h_in": h_in,
                   "orientation": None if not w_in else ("landscape" if w_in > h_in else "portrait")},
        "colors": {k: dict(c.most_common()) for k, c in colors.items()},
        "fonts": {"typefaces": dict(fonts.most_common()), "sizes_pt": {str(k): v for k, v in sorted(sizes.items())}},
        "endings": {"last1": dict(last1.most_common(12)), "last2": dict(last2.most_common(12))},
        "symbols": {**dict(symbols.most_common()), **({"'- ' 행두": dash_prefix} if dash_prefix else {})},
        "textStats": {"n": len(lengths),
                      "medianLen": lengths[len(lengths) // 2] if lengths else None,
                      "p90Len": lengths[int(len(lengths) * 0.9)] if lengths else None},
        "englishLabelCandidates": dict(english.most_common(10)),
    }


def report(results):
    out = ["# 벤치마크 프로브 보고", ""]
    agg_colors = Counter()
    agg_last2 = Counter()
    for r in results:
        c = r["canvas"]
        out.append(f"## {Path(r['file']).name} — {r['slides']}장, {c['w_in']}×{c['h_in']}in ({c['orientation']})")
        out.append("")
        out.append(f"- 폰트: {', '.join(f'{k}(×{v})' for k, v in list(r['fonts']['typefaces'].items())[:3])}")
        fills = list(r["colors"]["fill"].items())[:8]
        texts = list(r["colors"]["text"].items())[:8]
        out.append(f"- 채움색 상위: {', '.join(f'{k}×{v}' for k, v in fills)}")
        out.append(f"- 글자색 상위: {', '.join(f'{k}×{v}' for k, v in texts)}")
        if r["colors"]["hl"]:
            out.append(f"- 형광: {', '.join(f'{k}×{v}' for k, v in r['colors']['hl'].items())}")
        out.append(f"- 종결(끝 2자) 상위: {', '.join(f'{k}×{v}' for k, v in list(r['endings']['last2'].items())[:6])}")
        out.append(f"- 기호: {', '.join(f'{k}×{v}' for k, v in r['symbols'].items()) or '(없음)'}")
        out.append(f"- 서술 텍스트 {r['textStats']['n']}건, 길이 중앙값 {r['textStats']['medianLen']}자 / p90 {r['textStats']['p90Len']}자")
        if r["englishLabelCandidates"]:
            out.append(f"- 영문 라벨 후보: {', '.join(r['englishLabelCandidates'])}")
        out.append("")
        for k, v in r["colors"]["fill"].items():
            agg_colors[k] += v
        for k, v in r["colors"]["text"].items():
            agg_colors[k] += v
        agg_last2.update(r["endings"]["last2"])
    if len(results) > 1:
        out.append("## 통합 (전 파일)")
        out.append("")
        out.append(f"- 색 상위 12: {', '.join(f'{k}×{v}' for k, v in agg_colors.most_common(12))}")
        out.append(f"- 종결 상위 6: {', '.join(f'{k}×{v}' for k, v in agg_last2.most_common(6))}")
        out.append("")
    out.append("다음 단계: 이 보고 + <파일>.probe.json + `npm run deck:text` 산출을 `prompts/pack-draft.md` 지시문과 함께")
    out.append("Claude Code에 주고 `rules/org/<새팩>/` 4파일 초안을 받는다 (README '부서 이동 절차').")
    return "\n".join(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print("사용법: npm run pack:probe -- <덱1.pptx> [<덱2.pptx> ...]", file=sys.stderr)
        sys.exit(2)
    results = []
    for a in args:
        p = Path(a)
        if not p.exists():
            print(f"파일 없음: {p}", file=sys.stderr)
            sys.exit(1)
        r = probe(p)
        out = p.with_suffix(p.suffix + ".probe.json")
        out.write_text(json.dumps(r, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        results.append(r)
        print(f"[probe] {out}", file=sys.stderr)
    print(report(results))


if __name__ == "__main__":
    main()
