# -*- coding: utf-8 -*-
"""DART 공시서류 원문(document.xml ZIP) 파서.

DART 원문은 자체 DTD 이고 자주 비정형이다(미정의 엔티티, 대문자 태그). 엄격한 XML
파서는 실패하므로 html.parser 기반의 관대한 파서를 쓴다. 표는 격자로 '추론'하지 않고
rowspan/colspan 을 그대로 실어 내보낸다 — COLSPAN 헤더에서 격자를 잘못 짜면 기말 CSM
이 전기 칸으로 밀린다.
"""
from __future__ import annotations

import io
import os
import re
import unicodedata
import zipfile
from html.parser import HTMLParser

CELL_TAGS = {"td", "th", "te", "tu"}
SECTION_TAGS = re.compile(r"^section(-\d+)?$")
DEFAULT_MAX_DOC_BYTES = 200 * 1024 * 1024
MAX_ZIP_RATIO = 200  # 압축폭탄 방어

# 원문에 흔한 미정의 엔티티 (엄격 파서를 죽이는 주범)
ENTITY_TEXT = {
    "cir": "○", "nbsp": " ", "middot": "·", "bull": "•", "times": "×",
    "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'",
    "cr": "", "lowbar": "_", "sim": "~", "deg": "°", "permil": "‰",
}


def normalize_for_match(s: str) -> str:
    """매칭 전용. 출력에는 항상 원문을 쓴다.

    DART 는 중점 자리에 ㆍ(U+318D)를 쓴다 — 정규화하지 않으면 보고서 유형이 통째로 샌다.
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    for ch in "ㆍ·・‧":
        s = s.replace(ch, "·")
    s = s.replace(" ", " ").replace("　", " ")
    return re.sub(r"\s+", " ", s).strip()


# ── 인코딩 ────────────────────────────────────────────────────────────────
def decode_document(data: bytes):
    """(text, declared, used, replacements) — cp949 는 euc-kr 상위집합이라 따로 안 쓴다.

    선언이 utf-8 인데 실제로는 cp949 인 문서가 존재하므로 선언을 맹신하지 않는다.
    """
    m = re.search(rb'encoding\s*=\s*["\']([\w\-]+)["\']', data[:512])
    declared = m.group(1).decode("ascii", "replace").lower() if m else ""
    ladder = []
    if declared:
        ladder.append(declared)
    ladder += ["utf-8-sig", "utf-8", "cp949"]
    for enc in ladder:
        try:
            return data.decode(enc), declared, enc, 0
        except (UnicodeDecodeError, LookupError):
            continue
    text = data.decode("cp949", errors="replace")
    return text, declared, "cp949+replace", text.count("�")


# ── ZIP ───────────────────────────────────────────────────────────────────
def safe_members(zf: zipfile.ZipFile):
    """경로 traversal 과 압축폭탄을 거른다."""
    out = []
    for info in zf.infolist():
        name = info.filename
        if info.is_dir():
            continue
        if name.startswith("/") or ".." in name.replace("\\", "/").split("/"):
            continue
        if info.compress_size and info.file_size / max(info.compress_size, 1) > MAX_ZIP_RATIO:
            continue
        out.append(info)
    return out


def pick_principal(members, rcept_no):
    """본문 멤버 선택: 이름 정확일치 우선, 없으면 최대 .xml."""
    exact = [m for m in members if os.path.basename(m.filename).lower() == "%s.xml" % rcept_no.lower()]
    if exact:
        return exact[0], "exact_name"
    xmls = [m for m in members if m.filename.lower().endswith(".xml")]
    if xmls:
        return max(xmls, key=lambda m: m.file_size), "largest_xml"
    if members:
        return max(members, key=lambda m: m.file_size), "largest_any"
    return None, "none"


def read_zip(body: bytes, rcept_no: str, max_bytes=DEFAULT_MAX_DOC_BYTES):
    """ZIP → {members, principal, text, encoding..., truncated}"""
    zf = zipfile.ZipFile(io.BytesIO(body))
    members = safe_members(zf)
    info = {"namelist": [m.filename for m in members],
            "member_sizes": {m.filename: m.file_size for m in members}}
    principal, how = pick_principal(members, rcept_no)
    info["member_selected"] = principal.filename if principal else ""
    info["member_selection"] = how
    if principal is None:
        info.update(text="", truncated=False, encoding_declared="", encoding_used="",
                    decode_replacements=0)
        return info
    if principal.file_size > max_bytes:
        info.update(text="", truncated=True, encoding_declared="", encoding_used="",
                    decode_replacements=0)
        return info
    with zf.open(principal) as fh:
        data = fh.read(max_bytes + 1)
    truncated = len(data) > max_bytes
    text, declared, used, repl = decode_document(data[:max_bytes])
    info.update(text=text, truncated=truncated, encoding_declared=declared,
                encoding_used=used, decode_replacements=repl)
    return info


# ── 파서 ──────────────────────────────────────────────────────────────────
class DartDocParser(HTMLParser):
    """섹션(TITLE 기준)과 표를 추출한다. 의미 정규화는 하지 않는다."""

    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.src = text
        self._line_starts = [0]
        for i, ch in enumerate(text):
            if ch == "\n":
                self._line_starts.append(i + 1)
        self.sections = []          # {title, title_raw, text_parts, tables, start}
        self._cur = None
        self._mode = None           # title | cell | text
        self._buf = []
        self._table = None
        self._row = None
        self._cell_attrs = {}
        self._table_start = 0
        self._recent_text = []      # 표 직전 '(단위: 백만원)' 포착용
        self._ensure_section(0, "(머리말)")

    # 위치 → 문자 오프셋
    def _off(self):
        line, col = self.getpos()
        return self._line_starts[min(line - 1, len(self._line_starts) - 1)] + col

    def _ensure_section(self, off, title):
        self._cur = {"title": normalize_for_match(title), "title_raw": title,
                     "text_parts": [], "tables": [], "start": off}
        self.sections.append(self._cur)
        self._recent_text = []   # 단위 표기가 섹션 경계를 넘어 잘못 붙는 것을 막는다

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        a = {k.lower(): (v or "") for k, v in attrs}
        if t == "title":
            self._mode, self._buf = "title", []
        elif t in ("table", "table-group"):
            self._table = {"rows": [], "unit_hint": self._find_unit(),
                           "unit_hint_source": "", "caption": "", "start": self._off()}
            self._table_start = self._off()
        elif t == "tr" and self._table is not None:
            self._row = []
        elif t in CELL_TAGS and self._row is not None:
            self._mode, self._buf, self._cell_attrs = "cell", [], a
        elif t == "p":
            self._mode, self._buf = "text", []

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        t = tag.lower()
        txt = normalize_for_match("".join(self._buf))
        if t == "title":
            self._ensure_section(self._off(), "".join(self._buf).strip())
            self._mode, self._buf = None, []
        elif t in CELL_TAGS and self._row is not None:
            self._row.append({
                "text": txt,
                "rowspan": self._cell_attrs.get("rowspan", ""),
                "colspan": self._cell_attrs.get("colspan", ""),
                "tag": t,
            })
            self._mode, self._buf, self._cell_attrs = None, [], {}
        elif t == "tr" and self._row is not None:
            if self._row:
                self._table["rows"].append(self._row)
            self._row = None
        elif t in ("table", "table-group") and self._table is not None:
            self._table["raw_xml"] = self.src[self._table_start:self._off() + len(tag) + 3]
            # 단위 표기가 표 바깥 <P> 가 아니라 표의 첫 행 셀에 들어 있는 경우가 흔하다
            # (실측: 동양생명 2024 주석의 CSM 롤포워드 표). 표 안에 있으면 그 표의 것이
            # 확실하므로 앞 <P> 추정보다 우선한다. 원문 그대로만 싣고 환산하지 않는다.
            for row in self._table["rows"][:3]:
                found = next((c["text"] for c in row if "단위" in c["text"]), None)
                if found:
                    self._table["unit_hint"] = found
                    self._table["unit_hint_source"] = "table_cell"
                    break
            else:
                if self._table["unit_hint"]:
                    self._table["unit_hint_source"] = "preceding_text"
            if self._cur is not None:
                self._cur["tables"].append(self._table)
            self._table = None
        elif t == "p":
            if txt:
                self._recent_text.append(txt)
                del self._recent_text[:-8]
                if self._cur is not None and self._table is None:
                    self._cur["text_parts"].append(txt)
            self._mode, self._buf = None, []

    def handle_data(self, d):
        if self._mode:
            self._buf.append(d)
        elif self._cur is not None and self._table is None:
            s = d.strip()
            if s:
                self._cur["text_parts"].append(s)

    # 미정의 엔티티가 파싱을 죽이지 않게 한다
    def handle_entityref(self, name):
        rep = ENTITY_TEXT.get(name.lower(), "")
        if self._mode:
            self._buf.append(rep)

    def handle_charref(self, name):
        try:
            ch = chr(int(name[1:], 16) if name[:1].lower() == "x" else int(name))
        except Exception:
            ch = ""
        if self._mode:
            self._buf.append(ch)

    def _find_unit(self):
        """DART 는 '(단위: 백만원)' 을 TABLE 바깥 바로 앞 P 에 쓴다. 원문 그대로만 싣는다."""
        for s in reversed(self._recent_text[-5:]):
            if "단위" in s:
                return s
        return ""


def parse_document(text):
    p = DartDocParser(text)
    try:
        p.feed(text)
        p.close()
    except Exception as e:  # 어떤 문서도 전체 실행을 죽이지 않는다
        return p.sections, "parser_error: %s" % type(e).__name__
    return p.sections, ""


def match_sections(sections, keywords):
    """키워드가 걸린 섹션만 (index, section, matched) 로 돌려준다."""
    normed = [(k, normalize_for_match(k)) for k in keywords]
    out = []
    for i, sec in enumerate(sections):
        title = sec["title"]
        if not title:
            continue
        hits = [k for k, nk in normed if nk and nk in title]
        if hits:
            out.append((i, sec, hits))
    return out


def table_keywords(table, keywords):
    """표 안의 셀 텍스트에 걸린 키워드. 제목이 아니라 내용으로 표를 고르기 위한 것."""
    blob = " ".join(c["text"] for r in table["rows"] for c in r)
    return [k for k in keywords if k in blob]


def section_body(section):
    return " ".join(section["text_parts"])


def slug(s, n=40):
    s = re.sub(r"[^0-9A-Za-z가-힣]+", "_", normalize_for_match(s))
    return s.strip("_")[:n] or "section"
