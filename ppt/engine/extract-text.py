#!/usr/bin/env python3
"""pptx 텍스트 추출 (stdlib만 사용) — 골든 대조·QA용.
사용: npm run deck:text -- <pptx> [expected.md]
expected.md를 주면 줄 단위 다중집합 비교 결과(누락/추가)를 출력한다."""
import re
import sys
import zipfile
from collections import Counter
from html import unescape


def slide_texts(path):
    z = zipfile.ZipFile(path)
    names = sorted(
        (n for n in z.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)),
        key=lambda n: int(re.search(r"\d+", n).group()),
    )
    out = []
    for n in names:
        xml = z.read(n).decode("utf-8")
        # 문단(<a:p>) 단위로 런(<a:t>)을 결합 — markitdown과 같은 granularity
        texts = []
        for para in re.findall(r"<a:p>(.*?)</a:p>", xml, re.S):
            joined = "".join(unescape(t) for t in re.findall(r"<a:t>(.*?)</a:t>", para, re.S))
            if joined.strip():
                texts.append(joined)
        out.append((n, texts))
    return out


def norm(line):
    return re.sub(r"\s+", " ", line).strip()


def main():
    if len(sys.argv) < 2:
        print("사용법: extract-text.py <pptx> [expected.md]", file=sys.stderr)
        sys.exit(2)
    slides = slide_texts(sys.argv[1])
    for name, texts in slides:
        print(f"<!-- {name} -->")
        for t in texts:
            print(t)
        print()

    if len(sys.argv) >= 3:
        built = Counter(norm(t) for _, ts in slides for t in ts if norm(t))
        expected_lines = []
        with open(sys.argv[2], encoding="utf-8") as f:
            for raw in f:
                line = norm(raw)
                if not line or line.startswith("<!--") or line.startswith("###"):
                    continue
                expected_lines.append(line)
        expected = Counter(expected_lines)
        missing = expected - built
        extra = built - expected
        print("=" * 60)
        print(f"대조: 기대 {sum(expected.values())}줄 / 산출 {sum(built.values())}줄")
        if missing:
            print(f"\n[산출물에 없음] {sum(missing.values())}줄:")
            for line, c in missing.items():
                print(f"  - {line}" + (f" ×{c}" if c > 1 else ""))
        if extra:
            print(f"\n[기대에 없음(추가)] {sum(extra.values())}줄:")
            for line, c in extra.items():
                print(f"  + {line}" + (f" ×{c}" if c > 1 else ""))
        if not missing and not extra:
            print("\n완전 일치.")


if __name__ == "__main__":
    main()
