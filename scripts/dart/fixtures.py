# -*- coding: utf-8 -*-
"""오프라인 픽스처 생성.

네트워크 없이 collect→emit 전 구간을 돌리기 위한 가짜 DART 응답을 만든다.
블라인드로 쓴 코드가 사용자 머신에서 처음 실행되는 일을 막는 유일한 장치라
'정상' 뿐 아니라 실패 모드를 골고루 넣는다.
"""
from __future__ import annotations

import io
import json
import os
import zipfile

import config

# 픽스처용 corp_code (실제 값 아님 — 자릿수·형식만 맞춘 합성값)
CODES = {
    "신한지주": "00100001", "KB금융": "00100002", "iM금융지주": "00100003",
    "우리금융지주": "00100004", "한화생명보험": "00100005",
    "신한라이프생명보험": "00100006", "신한이지손해보험": "00100007",
    "KB손해보험": "00100008", "KB라이프생명보험": "00100009",
    "iM라이프생명보험": "00100010", "동양생명보험": "00100011",
    "ABL생명보험": "00100012", "한화손해보험": "00100013", "캐롯손해보험": "00100014",
    "오렌지라이프생명보험": "00100015", "KB생명보험": "00100016",
    "우리금융지주(구)": "00100017",
}
EST = {"신한지주": "20010901", "KB금융": "20080929", "iM금융지주": "20110517",
       "우리금융지주": "20190111", "우리금융지주(구)": "20010327"}


def _w(root, ep, name, data, binary=False):
    d = os.path.join(root, ep)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name)
    mode = "wb" if binary else "w"
    with open(p, mode, **({} if binary else {"encoding": "utf-8"})) as f:
        f.write(data)
    return p


def _json(root, ep, name, obj):
    return _w(root, ep, name + ".json", json.dumps(obj, ensure_ascii=False))


def _ok(rows):
    return {"status": "000", "message": "정상", "list": rows}


NO_DATA = {"status": "013", "message": "조회된 데이타가 없습니다."}


# ── corpCode.xml ZIP ──────────────────────────────────────────────────────
def corp_code_zip():
    parts = ['<?xml version="1.0" encoding="UTF-8"?>', "<result>"]
    for t in config.TARGETS:
        label = t["label"]
        name = "우리금융지주" if label == "우리금융지주(구)" else label
        # 비상장의 stock_code 는 빈 문자열이 아니라 공백 6칸이다 (truthiness 함정)
        sc = t.get("stock_code") or "      "
        parts.append(
            "<list><corp_code>%s</corp_code><corp_name>%s</corp_name>"
            "<corp_eng_name>%s</corp_eng_name><stock_code>%s</stock_code>"
            "<modify_date>20260801</modify_date></list>"
            % (CODES[label], name, label.encode("ascii", "ignore").decode() or "X", sc))
    # 무관한 동명이인 + 잡음
    parts.append("<list><corp_code>00999001</corp_code><corp_name>동양생명과학</corp_name>"
                 "<stock_code>      </stock_code><modify_date>20200101</modify_date></list>")
    parts.append("</result>")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("CORPCODE.xml", "".join(parts).encode("utf-8"))
    return buf.getvalue()


# ── document.xml ZIP (cp949 + TE/TU + COLSPAN + 단위) ─────────────────────
DOC_XML = """<?xml version="1.0" encoding="euc-kr"?>
<DOCUMENT><BODY>
<SECTION-1><TITLE>I. 회사의 개요</TITLE><P>당사는 &cir; 금융지주회사입니다.</P></SECTION-1>
<SECTION-1><TITLE>2. 계열회사에 관한 사항</TITLE>
<P>(단위: 백만원)</P>
<TABLE><TR><TH ROWSPAN="2">회사명</TH><TH COLSPAN="2">지분율</TH></TR>
<TR><TE>당기</TE><TE>전기</TE></TR>
<TR><TD>한화손해보험</TD><TE>51.36</TE><TE>51.36</TE></TR>
<TR><TU>캐롯손해보험</TU><TD>-</TD><TD>100.00</TD></TR></TABLE></SECTION-1>
<SECTION-1><TITLE>3. 기타 참고사항</TITLE>
<P>주석 본문입니다.</P>
<TABLE><TR><TH COLSPAN="2">(단위 : 백만원)</TH></TR>
<TR><TH>구분</TH><TH>비금융위험 위험조정</TH><TH>보험계약마진</TH></TR>
<TR><TD>기초</TD><TD>437,393</TD><TD>2,541,801</TD></TR></TABLE>
<TABLE><TR><TH>무관한 표</TH></TR><TR><TD>키워드 없음</TD></TR></TABLE></SECTION-1>
<SECTION-1><TITLE>가. 관계회사 및 자회사의 투자지분 현황</TITLE>
<P>2001년식 표기. 이 시기 보고서에는 '계열회사'라는 말이 나오지 않는다.</P>
<TABLE><TR><TH>관계회사명</TH><TH>지분율</TH></TR>
<TR><TD>신한은행</TD><TD>100.00</TD></TR></TABLE></SECTION-1>
<SECTION-1><TITLE>4. 특수관계자와의 거래</TITLE>
<P>2016년 중 한화건설로부터 한화손해보험 주식을 취득하였습니다.</P></SECTION-1>
</BODY></DOCUMENT>"""


def document_zip(rcept_no, lead_slash=False):
    """lead_slash: DART 는 멤버명 앞에 '/' 를 붙여 내려주는 경우가 있다.
    실측 69개 중 21개가 그랬고, traversal 로 오인해 거부하면 본문이 통째로 날아간다."""
    pre = "/" if lead_slash else ""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("%s%s.xml" % (pre, rcept_no), DOC_XML.encode("euc-kr"))
        z.writestr("%s%s_attach.xml" % (pre, rcept_no), b"<DOCUMENT><BODY></BODY></DOCUMENT>")
    return buf.getvalue()


# ── 재무제표 ──────────────────────────────────────────────────────────────
def fs_rows(rcept_no, year, insurer):
    base = dict(rcept_no=rcept_no, reprt_code="11011", bsns_year=str(year),
                corp_code="", currency="KRW")
    rows = [
        dict(base, sj_div="BS", sj_nm="재무상태표", account_id="ifrs-full_Assets",
             account_nm="자산총계", account_detail="-", ord="1",
             thstrm_nm="제10기", thstrm_amount="1,000,000",
             frmtrm_nm="제9기", frmtrm_amount="900,000",
             bfefrmtrm_nm="제8기", bfefrmtrm_amount="800,000"),
        # frmtrm_amount 가 아예 없는 행 — DART 는 null 키를 뺀다
        dict(base, sj_div="BS", sj_nm="재무상태표", account_id="-표준계정코드 미사용-",
             account_nm="보험계약부채" if insurer else "예수부채", account_detail="",
             ord="2", thstrm_nm="제10기", thstrm_amount="△12,345",
             bfefrmtrm_nm="제8기", bfefrmtrm_amount="-"),
        # 분기 전용 키가 섞여 들어오는 행 (고정 3-term 가정을 깨는 케이스)
        dict(base, sj_div="IS", sj_nm="손익계산서", account_id="ifrs-full_Revenue",
             account_nm="보험수익" if insurer else "영업수익", account_detail="", ord="3",
             thstrm_nm="제10기", thstrm_amount="(5,000)", thstrm_add_amount="10,000",
             frmtrm_q_nm="제9기 반기", frmtrm_q_amount="4,500",
             frmtrm_nm="제9기", frmtrm_amount="9,000",
             unexpected_new_field="드리프트확인용"),
    ]
    return rows


def build(root):
    """픽스처 트리를 만든다."""
    os.makedirs(root, exist_ok=True)
    _w(root, "corpCode", "corpCode.zip", corp_code_zip(), binary=True)

    for label, cc in CODES.items():
        t = config.TARGETS_BY_LABEL[label]
        _json(root, "company", cc, {
            "status": "000", "message": "정상", "corp_code": cc,
            "corp_name": "우리금융지주" if label == "우리금융지주(구)" else label,
            "corp_name_eng": "X", "stock_name": label,
            "stock_code": t.get("stock_code") or "", "ceo_nm": "홍길동",
            "corp_cls": "Y" if t.get("stock_code") else "E",
            "jurir_no": "1101110000%02d" % (int(cc[-2:]) % 100),
            "bizr_no": "1010100000", "adres": "서울특별시",
            "hm_url": "", "ir_url": "", "phn_no": "02-0000-0000", "fax_no": "",
            "induty_code": "6511" if t["entity_type"] == "생보" else "6420",
            "est_dt": EST.get(label, "19900101"), "acc_mt": "12"})

        # 공시목록: 사업보고서 + (신한이지는 감사보고서만) + 한화생명 주요사항보고서
        rows, n = [], 0
        if label == "신한이지손해보험":
            for y in config.DEFAULT_YEARS:
                n += 1
                rows.append(dict(corp_cls="E", corp_code=cc, corp_name=label,
                                 stock_code="", report_nm="연결감사보고서제출",
                                 rcept_no="%d03%02d%06d" % (y + 1, n, n), flr_nm=label,
                                 rcept_dt="%d0315" % (y + 1), rm=""))
        else:
            for y in (2016, 2021, 2022, 2023, 2024, 2025):
                n += 1
                rows.append(dict(corp_cls="Y" if t.get("stock_code") else "E",
                                 corp_code=cc, corp_name=label, stock_code=t.get("stock_code") or "",
                                 report_nm="사업보고서 (%d.12)" % y,
                                 rcept_no="%d03%02d%06d" % (y + 1, n, n),
                                 flr_nm=label, rcept_dt="%d0331" % (y + 1), rm=""))
            if label == "한화생명보험":
                rows.append(dict(corp_cls="Y", corp_code=cc, corp_name=label, stock_code="088350",
                                 report_nm="주요사항보고서(타법인주식및출자증권취득결정)",
                                 rcept_no="20160415000777", flr_nm=label,
                                 rcept_dt="20160415", rm=""))
            if label == "한화손해보험":
                rows.append(dict(corp_cls="Y", corp_code=cc, corp_name=label, stock_code="000370",
                                 report_nm="최대주주변경",
                                 rcept_no="20160418000888", flr_nm=label,
                                 rcept_dt="20160418", rm=""))
        _json(root, "list", "%s_p001" % cc,
              dict(_ok(rows), page_no=1, page_count=100,
                   total_count=len(rows), total_page=1))

        insurer = t["entity_type"] in ("생보", "손보")
        # 지주·선행법인 백필(2015~2020)까지 포함해 그리드 전체를 덮는다
        all_years = sorted(set(config.DEFAULT_YEARS) | set(config.HOLDING_BACKFILL_YEARS)
                           | set(t.get("extra_years") or []))
        for y in all_years:
            for fs in ("CFS", "OFS"):
                name = "%s_%d_11011_%s" % (cc, y, fs)
                if label == "캐롯손해보험" and y >= 2025:
                    _json(root, "fnlttSinglAcntAll", name, NO_DATA)
                else:
                    _json(root, "fnlttSinglAcntAll", name,
                          _ok(fs_rows("%d0331000001" % (y + 1), y, insurer)))
            for ep in config.REPORT_ENDPOINTS:
                name = "%s_%d_11011" % (cc, y)
                _json(root, ep, name, _endpoint_rows(ep, cc, label, y))
            for fs in ("CFS", "OFS"):
                _json(root, "fnlttSinglAcntAll", "%s_%d_11012_%s" % (cc, y, fs), NO_DATA)
            for ep in config.REPORT_ENDPOINTS:
                _json(root, ep, "%s_%d_11012" % (cc, y), NO_DATA)
        for y in config.DEFAULT_HALF_YEARS:
            for fs in ("CFS", "OFS"):
                _json(root, "fnlttSinglAcntAll", "%s_%d_11012_%s" % (cc, y, fs), NO_DATA)
            for ep in config.REPORT_ENDPOINTS:
                _json(root, ep, "%s_%d_11012" % (cc, y), NO_DATA)

    # Phase 0 탐침 ① 용: 2015 미만은 013, 이상은 000 (문서상 "2015년 이후 부터 정보제공")
    import phase0 as _p0
    for label in _p0.PROBE_SUBJECTS:
        cc = CODES[label]
        for ep in _p0.PROBE_ENDPOINTS:
            for y in _p0.PROBE_YEARS:
                name = "%s_%d_11011" % (cc, y)
                _json(root, ep, name,
                      _endpoint_rows(ep, cc, label, y) if y >= 2015 else NO_DATA)

    # 원문 ZIP
    for i, rcept in enumerate(("20170331000001", "20260331000006", "20160415000777",
                               "20160418000888", "20250331000005")):
        _w(root, "document", "%s.zip" % rcept,
           document_zip(rcept, lead_slash=(i % 2 == 1)), binary=True)
    _w(root, "document", "_default.zip", document_zip("00000000000000"), binary=True)
    _w(root, "fnlttXbrl", "_default.xml",
       '<?xml version="1.0" encoding="UTF-8"?><result><status>013</status>'
       '<message>조회된 데이타가 없습니다.</message></result>')
    _json(root, "xbrlTaxonomy", "_default", NO_DATA)
    return root


def _endpoint_rows(ep, cc, label, year):
    """엔드포인트마다 컬럼 집합이 다르다는 사실을 픽스처로 재현한다."""
    common = dict(rcept_no="%d0331000001" % (year + 1), corp_cls="Y", corp_code=cc,
                  corp_name=label, stlm_dt="%d-12-31" % year)
    if ep == "otrCprInvstmntSttus":
        child = "한화손해보험" if label == "한화생명보험" else "자회사A"
        return _ok([dict(common, inv_prm=child, frst_acqs_de="2016-04-15",
                         invstmnt_purps="경영참여", frst_acqs_amount="1,000,000",
                         bsis_blce_qy="10,000", bsis_blce_qota_rt="51.36",
                         bsis_blce_acntbk_amount="900,000",
                         incrs_dcrs_acqs_dsps_qy="-", incrs_dcrs_acqs_dsps_amount="-",
                         incrs_dcrs_evl_lstmn="-", trmend_blce_qy="10,000",
                         trmend_blce_qota_rt="51.36", trmend_blce_acntbk_amount="950,000",
                         recent_bsns_year_fnnr_sttus_tot_assets="12,000,000",
                         recent_bsns_year_fnnr_sttus_thstrm_ntpf="100,000")])
    if ep == "hyslrSttus":
        return _ok([dict(common, nm="지주회사", relate="최대주주", stock_knd="보통주",
                         bsis_posesn_stock_co="100", bsis_posesn_stock_qota_rt="100.00",
                         trmend_posesn_stock_co="100", trmend_posesn_stock_qota_rt="100.00",
                         rm="")])
    if ep == "irdsSttus":
        return _ok([dict(common, isu_dcrs_de="%d-06-30" % year,
                         isu_dcrs_stle="유상증자(주주배정)", isu_dcrs_stock_knd="보통주",
                         isu_dcrs_qy="1,000,000", isu_dcrs_mstvdv_fval_amount="5,000",
                         isu_dcrs_mstvdv_amount="10,000")])
    if ep == "cprndNrdmpBlce":
        # 회사채: 1/2/3/4/5/10년 구간
        return _ok([dict(common, remndr_exprtn1="회사채", remndr_exprtn2="합계",
                         yy1_below="100", yy1_excess_yy2_below="200",
                         yy2_excess_yy3_below="300", yy3_excess_yy4_below="400",
                         yy4_excess_yy5_below="500", yy5_excess_yy10_below="600",
                         yy10_excess="700", sm="2,800")])
    if ep == "newCaplScritsNrdmpBlce":
        # 신종자본증권: 구간이 회사채와 '다르다' (파서 공유 금지 확인용)
        return _ok([dict(common, remndr_exprtn1="신종자본증권", remndr_exprtn2="합계",
                         yy1_below="10", yy1_excess_yy5_below="20",
                         yy5_excess_yy10_below="30", yy10_excess_yy15_below="40",
                         yy15_excess_yy20_below="50", yy20_excess_yy30_below="60",
                         yy30_excess="70", sm="280")])
    if ep == "alotMatter":
        return _ok([dict(common, se="주당액면가액(원)", stock_knd="보통주",
                         thstrm="5,000", frmtrm="5,000", lwfr="5,000"),
                    dict(common, se="현금배당수익률(%)", stock_knd="보통주",
                         thstrm="4.5", frmtrm="4.1", lwfr="-")])
    if ep == "empSttus":
        return _ok([dict(common, fo_bbm="전체", sexdstn="남", rgllbr_co="1,000",
                         cnttk_co="50", sm="1,050", avrg_cnwk_sdytrn="12.3",
                         fyer_salary_totamt="100,000,000", jan_salary_am="95,000")])
    return _ok([dict(common)])
