# -*- coding: utf-8 -*-
"""수집 대상·엔드포인트 정의.

여기 있는 값은 전부 '설정'이며 DART 응답이 아니다. 출력 CSV 에서 이 파일에서 온
컬럼은 value_source=config 로 표시된다.
"""

BASE_URL = "https://opendart.fss.or.kr/api"

# ── 보고서 코드 ────────────────────────────────────────────────────────────
REPRT_ANNUAL = "11011"  # 사업보고서
REPRT_HALF = "11012"  # 반기보고서
REPRT_Q1 = "11013"
REPRT_Q3 = "11014"
REPRT_NAMES = {
    "11011": "사업보고서",
    "11012": "반기보고서",
    "11013": "1분기보고서",
    "11014": "3분기보고서",
}

# ── DART status 코드 ──────────────────────────────────────────────────────
STATUS_MESSAGES = {
    "000": "정상",
    "010": "등록되지 않은 키",
    "011": "사용할 수 없는 키",
    "012": "접근할 수 없는 IP",
    "013": "조회된 데이타가 없습니다",
    "014": "파일이 존재하지 않습니다",
    "020": "요청 제한을 초과하였습니다",
    "021": "조회 가능한 회사 개수가 초과",
    "100": "필드의 부적절한 값",
    "101": "부적절한 접근",
    "800": "시스템 점검으로 서비스 중지",
    "900": "정의되지 않은 오류",
    "901": "개인정보 보유기간 만료 키",
}
# 응답으로서 의미가 있어 캐시해도 되는 status
CACHEABLE_STATUS = {"000", "013", "014", "100", "101"}
# 환경/키 문제 — 즉시 중단하고 캐시하지 않는다. 이걸 캐시하면 한도 초과 한 번이
# "데이터 없음" 수천 건으로 영구 기록된다.
FATAL_STATUS = {"010", "011", "012", "020", "800", "900", "901"}

# ── 엔드포인트 ────────────────────────────────────────────────────────────
# kind: json | zip
# grain: 어떤 파라미터 조합으로 호출되는가 (raw 파일명·emit 그룹핑에 쓰인다)
ENDPOINTS = {
    "corpCode":               dict(path="corpCode.xml",               kind="zip",  grain="none",   csv=None),
    "company":                dict(path="company.json",               kind="json", grain="corp",   csv="01_기업개황"),
    "list":                   dict(path="list.json",                  kind="json", grain="list",   csv="02_공시목록"),
    "fnlttSinglAcntAll":      dict(path="fnlttSinglAcntAll.json",     kind="json", grain="fs",     csv="03_재무제표"),
    "otrCprInvstmntSttus":    dict(path="otrCprInvstmntSttus.json",   kind="json", grain="report", csv="04_타법인출자현황"),
    "hyslrSttus":             dict(path="hyslrSttus.json",            kind="json", grain="report", csv="05_최대주주현황"),
    "irdsSttus":              dict(path="irdsSttus.json",             kind="json", grain="report", csv="06_증자감자현황"),
    "cprndNrdmpBlce":         dict(path="cprndNrdmpBlce.json",        kind="json", grain="report", csv="07_회사채미상환잔액"),
    "newCaplScritsNrdmpBlce": dict(path="newCaplScritsNrdmpBlce.json",kind="json", grain="report", csv="08_신종자본증권미상환잔액"),
    "alotMatter":             dict(path="alotMatter.json",            kind="json", grain="report", csv="09_배당"),
    "empSttus":               dict(path="empSttus.json",              kind="json", grain="report", csv="10_직원현황"),
    "document":               dict(path="document.xml",               kind="zip",  grain="rcept",  csv=None),
    "fnlttXbrl":              dict(path="fnlttXbrl.xml",              kind="zip",  grain="rcept",  csv=None),
    "xbrlTaxonomy":           dict(path="xbrlTaxonomy.json",          kind="json", grain="taxo",   csv=None),
}

# 정기보고서 주요정보 7종 (Phase 1 의 주력)
REPORT_ENDPOINTS = [
    "otrCprInvstmntSttus", "hyslrSttus", "irdsSttus", "cprndNrdmpBlce",
    "newCaplScritsNrdmpBlce", "alotMatter", "empSttus",
]

# 문서상 정보제공 시작연도 (Phase 0-1 이 실측으로 확인한다)
DOCUMENTED_FIRST_YEAR = 2015

DEFAULT_YEARS = list(range(2021, 2026))   # 요청 사양: 2021~2025
DEFAULT_HALF_YEARS = [2025, 2026]         # 반기까지 가능하면


def _t(label, group, entity_type, stock_code=None, aliases=(), active_from=None,
       active_to=None, status_note="현존", expect_est_dt=None, corp_code_hint=None,
       note=""):
    return dict(label=label, group=group, entity_type=entity_type,
                stock_code=stock_code, aliases=list(aliases),
                active_from=active_from, active_to=active_to,
                status_note=status_note, expect_est_dt=expect_est_dt,
                corp_code_hint=corp_code_hint, note=note)


# ── 대상 17 법인 ──────────────────────────────────────────────────────────
# aliases: corpCode.xml 에는 '현재 상호'만 있고 과거 사명이 없다. 그래도 과거 사명을
# 넣어 두는 이유는 (a) 개명이 아직 반영 안 된 스냅샷 대비 (b) 휴면·해산 법인이 옛
# 이름으로 남아 있는 경우 대비. 상장사는 stock_code 로 먼저 매칭하므로 별칭에 의존하지 않는다.
TARGETS = [
    # ── 지주 5 ────────────────────────────────────────────────────────────
    _t("신한지주", "지주", "지주", stock_code="055550",
       aliases=["신한지주", "신한금융지주회사", "주식회사신한금융지주회사"],
       active_from="20010901", expect_est_dt="20010901", corp_code_hint="00382199",
       note="국내 최초 민간 주도 금융지주"),
    _t("KB금융", "지주", "지주", stock_code="105560",
       aliases=["KB금융", "KB금융지주", "케이비금융", "케이비금융지주"],
       active_from="20080929", expect_est_dt="20080929"),
    _t("iM금융지주", "지주", "지주", stock_code="139130",
       aliases=["iM금융지주", "아이엠금융지주", "DGB금융지주", "디지비금융지주"],
       active_from="20110517", expect_est_dt="20110517",
       note="2025-03-26 DGB금융지주 → iM금융지주 개명 (자회사는 2024 선행 개명)"),
    _t("우리금융지주", "지주", "지주", stock_code="316140",
       aliases=["우리금융지주"],
       active_from="20190111", expect_est_dt="20190111",
       note="2019 신설 지주. 구 우리금융지주(2001~2014)와 동명이므로 반드시 종목코드로 매칭"),
    _t("한화생명보험", "지주", "생보", stock_code="088350",
       aliases=["한화생명", "한화생명보험", "대한생명보험"],
       corp_code_hint="00113058",
       note="금융지주회사법상 지주회사가 아니다. 보험업법상 자회사 소유 구조. "
            "보험지주 벤치마크로만 사용"),

    # ── 보험 자회사 9 ─────────────────────────────────────────────────────
    _t("신한라이프생명보험", "보험자회사", "생보",
       aliases=["신한라이프생명보험", "신한생명보험"],
       note="2021-07-01 신한생명(존속) + 오렌지라이프(소멸). corp_code 는 구 신한생명 것"),
    _t("신한이지손해보험", "보험자회사", "손보",
       aliases=["신한이지손해보험", "신한EZ손해보험", "비엔피파리바카디프손해보험",
                "BNP파리바카디프손해보험", "카디프손해보험"],
       note="사업보고서 미제출(감사보고서만)일 가능성 — Phase 0-2 가 판정"),
    _t("KB손해보험", "보험자회사", "손보",
       aliases=["KB손해보험", "케이비손해보험", "LIG손해보험", "엘아이지손해보험",
                "LG화재해상보험"],
       status_note="상장폐지", note="2015 LIG손보 → KB손보 개명, 2017 완전자회사화로 상장폐지"),
    _t("KB라이프생명보험", "보험자회사", "생보",
       aliases=["KB라이프생명보험", "케이비라이프생명보험", "푸르덴셜생명보험"],
       note="2023-01-01 푸르덴셜생명(존속) + KB생명(소멸). corp_code 는 구 푸르덴셜 것"),
    _t("iM라이프생명보험", "보험자회사", "생보",
       aliases=["iM라이프생명보험", "아이엠라이프생명보험", "DGB생명보험",
                "디지비생명보험", "우리아비바생명보험", "LIG생명보험", "럭키생명보험"],
       note="2024-06-05 DGB생명 → iM라이프 개명"),
    _t("동양생명보험", "보험자회사", "생보", stock_code="082640",
       aliases=["동양생명", "동양생명보험"],
       status_note="상장폐지", expect_est_dt=None,
       note="2026-08-11 우리금융 포괄적 주식교환 완료 → 2026-08 말 상장폐지. "
            "종목코드가 이미 공란일 수 있으므로 상호 매칭 폴백 필요"),
    _t("ABL생명보험", "보험자회사", "생보",
       aliases=["ABL생명보험", "에이비엘생명보험", "알리안츠생명보험"],
       note="2017-08-01 알리안츠생명 → ABL생명 개명"),
    _t("한화손해보험", "보험자회사", "손보", stock_code="000370",
       aliases=["한화손해보험", "신동아화재해상보험"],
       corp_code_hint="00135917",
       note="2002-12 한화 인수, 2007-01-03 개명"),
    _t("캐롯손해보험", "보험자회사", "손보",
       aliases=["캐롯손해보험"],
       active_from="20191001", active_to="20251001", status_note="해산",
       note="2025-10-01 한화손해보험에 흡수합병되어 소멸. "
            "2025 이후 그리드는 not_applicable_entity_window"),

    # ── 선행·휴면 법인 3 ──────────────────────────────────────────────────
    _t("오렌지라이프생명보험", "선행법인", "생보",
       aliases=["오렌지라이프생명보험", "ING생명보험"],
       active_to="20210701", status_note="휴면",
       note="신한라이프 통합 전 절반. 2020 상장폐지, 2021-07-01 소멸"),
    _t("KB생명보험", "선행법인", "생보",
       aliases=["KB생명보험", "케이비생명보험"],
       active_to="20230101", status_note="휴면",
       note="KB라이프 통합 전 KB 측. 2023-01-01 소멸"),
    _t("우리금융지주(구)", "선행법인", "지주",
       aliases=["우리금융지주"],
       active_from="20010327", active_to="20141101", status_note="해산",
       note="1기 지주(2001~2014). 신 우리금융지주와 상호가 같다 — 신 지주가 선점한 "
            "corp_code 를 제외한 뒤 유일하게 남는 것을 채택하고, 아니면 사람에게 묻는다"),
]

TARGETS_BY_LABEL = {t["label"]: t for t in TARGETS}


# ── 합병·회계 단절 이벤트 ─────────────────────────────────────────────────
# 재무 시계열의 비교가능성이 끊기는 지점. comparability_break 플래그의 근거가 된다.
DISCONTINUITY_EVENTS = [
    ("신한라이프생명보험", "20210701", "merger",     "신한라이프생명보험", "오렌지라이프생명보험 흡수합병"),
    ("오렌지라이프생명보험", "20210701", "absorption", "신한라이프생명보험", "신한라이프로 흡수되어 소멸"),
    ("KB라이프생명보험",   "20230101", "merger",     "KB라이프생명보험",   "KB생명보험 흡수합병(존속=구 푸르덴셜)"),
    ("KB생명보험",         "20230101", "absorption", "KB라이프생명보험",   "KB라이프로 흡수되어 소멸"),
    ("한화손해보험",       "20251001", "merger",     "한화손해보험",       "캐롯손해보험 흡수합병"),
    ("캐롯손해보험",       "20251001", "absorption", "한화손해보험",       "한화손보로 흡수되어 소멸"),
    ("동양생명보험",       "20260811", "delisting",  "동양생명보험",       "우리금융 포괄적 주식교환 → 상장폐지"),
    ("iM금융지주",         "20250326", "rename",     "iM금융지주",         "DGB금융지주 → iM금융지주"),
    ("iM라이프생명보험",   "20240605", "rename",     "iM라이프생명보험",   "DGB생명보험 → iM라이프생명보험"),
    ("우리금융지주(구)",   "20141101", "absorption", "우리은행",           "우리은행에 흡수되어 해산"),
]
# IFRS17 은 전 보험사 공통이라 별도 규칙으로 처리 (emit.py)
IFRS17_FIRST_YEAR = 2023


# ── Phase 2 원문 추출 대상·키워드 ─────────────────────────────────────────
# 출범 직후 첫 사업보고서의 '기대 사업연도'. 검증용이며 불일치 시 경고만 낸다.
FIRST_REPORT_EXPECT = {
    "신한지주": 2001,
    "KB금융": 2008,
    "iM금융지주": 2011,
    "우리금융지주": 2019,
    "한화생명보험": 2016,  # 출범이 아니라 한화손보 지분 취득 시점
}

SECTION_KEYWORDS = [
    "계열회사에 관한 사항", "계열회사 현황", "계열회사",
    "사업의 내용", "사업의 개요",
    "종속기업", "관계기업", "연결대상",
    "타법인출자", "타법인 출자",
    "특수관계자",
    "보험계약부채", "계약서비스마진", "CSM",
]

# 한화생명 → 한화손해보험 지분 취득 추적용 보고서명 키워드.
# 대량보유상황보고서는 '피취득(발행) 법인' 코드로 색인되므로 한화손보 쪽에서 찾는다.
STAKE_REPORT_KEYWORDS = {
    "한화생명보험": ["타법인주식", "출자증권", "주요사항보고"],
    "한화손해보험": ["최대주주", "대량보유", "주식등의"],
}
