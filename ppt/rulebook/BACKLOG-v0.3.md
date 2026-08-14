# 백로그 — 실물급 템플릿 4종 (v0.3 후보)

실물 승인 덱 「New종신 PoC 상정 v1」(pptxgenjs 생성, 10장)의 신규 4장을 좌표 단위로 리버스 엔지니어링한 기록.
분석 시점: 2026-08. 골든 6장(표지·상품개요·무사고전환·여정·다이나믹프라이싱·기대효과)은 엔진과 동일 계보임이 확인됐고,
아래 4장만 현재 템플릿 레지스트리에 없다. **첫 실안건이 요구하는 시점에 장당 착수한다.**

공통 전제: 크롬(러닝헤더·27pt 제목·fn1 필·본문 프레임·쪽번호)과 헤드 층(세로 바+19pt+형광 런+13pt 보조문)은
엔진 chrome()/head()와 좌표까지 일치 — 아래는 본문 영역만 기술.

## 1. num_cards — 번호 카드 4열 (실물 3장 「왜 종신인가」)

- 4열 그리드: 카드 폭 2.86in, 열 간격 0.16, 피치 3.02, y 2.5~5.98 (h 3.48)
- 카드 구성(위→아래): 헤더 밴드 rect 0.46h 역할색 솔리드+흰 12pt bold / 바디 paper+0.75pt line /
  번호 칩 "01"~"04" 16pt bold 카드색 / 제목 2줄 13pt bold ink 행간 125% / 액센트 언더라인 1.0in·1.5pt 카드색 /
  설명 3줄 10.5pt legacyDark 행간 130% / 페이지 참조 필(알약, 역할색 Bg 틴트+"N페이지" 9pt bold 역할색)
- 카드별 역할색 계열: ours / ok(녹색 0E8A6A·E4F5EF — v0.3.0에서 등재됨) / fn1Text / fn2Text
- 하단 종합 스트립: y 6.18, 전폭 structure 채움 0.44h + 흰 12pt bold 센터, 원문자 ①~④ 교차참조
- p 안: `cards: [{h(헤더 라벨), t(제목 줄 1~2), d(설명 줄 1~3), ref?("4페이지"), role}] 2..4` + `strip?: {lead?, text}`
  — 번호는 인덱스에서 자동 생성, role 원색→헤더, Text 파생→칩·언더라인·ref 글자, Bg 파생→ref 필 배경

## 2. quad_insights — 2×2 스탯 타일 + 시사점 패널 (실물 4장 「고객 분석 결과」)

- 반폭 밴드 2개 병렬: x 0.72/6.82, w 5.8, 밴드 헤더 0.4h 둘 다 structure + 바디 플레이트 chartBg 5.8×3.5
- 좌: 2×2 스탯 타일(각 2.55×1.44, 값 24pt bold+라벨 10pt legacyDark). hi 타일만 problemBg 채움+problem 1.25pt
  테두리+값 problem색+상태 배지 9.5pt bold problem
- 우: 번호 리스트 3개(피치 1.06in) — "01" 12pt bold ours + 제목 13pt bold ink + 설명 2행 10.5pt lnSpc130
- 컬럼별 각주 2개: y 6.46, 좌·우 각각 8.5pt mut
- p 안: `{ lt, rt, q: [{v, l, tag?}]×4, hi: int, items: [{t, d}]×2..3, lfn?, rfn? }`

## 3. trend_panel — 추이 유사차트 + 동향 패널 (실물 5장 「시장 현황」)

- 좌 6.1in 차트 밴드 + 우 5.5in 패널, 반폭 밴드 헤더 2개, 플레이트 각 2.5h
- 차트: 단위 라벨 8.5pt, X축 기준선 legacyDark 1pt, 선분 6개 ours 2pt(상승), 마커 legacyBar 0.1(최종점 ours 0.15),
  값 라벨 9.5pt(최종만 bold ours), 월 라벨, 노랑 콜아웃 캡슐(calloutBg/calloutBorder, 2.1×0.42 플레이트 상단 중앙)
- 현행 trend와 차이: pts 7개(현행 최대 6), 오프셋 스케일(최저점이 기준선 위 0.91in), 반폭
- 우 패널: 세로 악센트 바 0.05×0.5(아이템별 역할색) + 12pt bold 제목 + 10pt 보조 2줄, 하단 출처 각주
- 하단 전폭 시사점 밴드: y 5.86, structure 채움 0.78h, "시사점: " 인라인 볼드 리드 + 12pt paper 본행 + 11pt coverSub 보조행
- p 안: `{ pts: 4..8, unit?, callout?, cfoot?, panel: {t, items: [{t, s, role?}] 2..4, foot?}, tk: {lead?, t, sub?} }`

## 4. verdict_table — 판정표 4행 (실물 6장 「PoC 성립 요건」)

- 3열: 라벨 컬럼(헤더는 밴드 없는 12pt bold legacyDark 텍스트, x 0.72 w 2.60) +
  건강보험 밴드(legacyDark, x 3.42 w 4.50) + 종신보험 밴드(ours, x 8.02 w 4.60), 밴드 y 2.48
- 행 4개: 피치 0.86(높이 0.80+간격 0.06), y 2.96~6.34
  - 라벨 셀: cellBg+테두리, 제목 12pt bold structure + 부연 2줄 9.5pt legacy lnSpc120 좌정렬
  - 판정 셀: mark에서 유도된 배경·테두리(✕→problemBg/problem, ○→oursBg/ours, △→cellBg/legacyDark) +
    기호 전용 박스 0.32in(✕ 14pt/○ 13pt bold 역할색) + 본문 2줄 11pt ink 좌정렬 — 기호와 본문 분리
- 하단 리소스 스트립: y 6.48, 흰 roundRect+line 테두리, "리소스: " bold structure + 본문 legacyDark 인라인 런
- p 안: `{ colHead, leftTitle, rightTitle, rows: [{tag, tagSub?, left: {mark, text}, right: {mark, text}}] 2..4, resource?: {label, text} }`
  — 색은 mark에서 유도, 스펙에 색 정보 불기입. v0.3.0의 `engine/lib/table.ts` 그리드 재사용 가능

## 실물에서 확인된 기타 개선 (M4에서 반영)

- bars: 범례 스와치(우상단, 계열 3개↑), 마지막 막대군 빨간 점선 강조 박스(emphasisBox), 커넥터 마감
- 인라인 볼드 혼합 런("시사점: "+본문, "리소스: "+본문) — chrome 공용 strip() 프리미티브 후보
