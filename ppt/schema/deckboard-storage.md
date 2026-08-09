# 덱보드 storage 스키마 v2 (window.storage)

점검결과 F10 픽스 반영판. 사용자별 격리(아티팩트 특성) — 혼자 사용 전제.
마이그레이션 판별은 각 값의 `schemaVersion`으로 한다. v1(핸드오프 사양의 스키마)은 배포된 적 없으므로 마이그레이션 코드는 두지 않는다.

## 키

### `deckboard:decks:v2` — 덱 목록

```jsonc
[{ "id": "d1723...", "title": "New종신 컨셉 보고", "createdAt": 1723..., "updatedAt": 1723... }]
```

### `deckboard:deck:{id}` — 덱 본문

```jsonc
{
  "schemaVersion": 2,
  "updatedAt": 1723...,          // 저장 시 갱신 — 다중 탭 last-write-wins 감지용 (불일치 시 경고 배너)
  "rulesVersion": "0.2.0",       // 임베드된 rules 버전 — 구버전 아티팩트 사용 식별
  "definition": {
    "q1": "방향 확인",            // "" | 승인 | 방향 확인 | 이견 해소 | 인지
    "q2": "", "q3": "", "q4": "", "q5": "",
    "priors": { "seen": "", "criteria": "", "losers": "" }   // Q3 보강 3문항 (ⓐⓑⓒ)
  },
  "archetype": { "id": "concept_proposal", "source": "auto" }, // source: auto(결정표) | manual(오버라이드)
  "chain": [
    {
      "id": "c3",                // ★ 줄 id — holes.atIds가 참조 (F10: 인덱스 참조 금지)
      "label": "컨셉",
      "head": "검진 지표 충족 시 갱신 보험료를 인하하는 정기보험임",  // [[...]] 마킹 = 형광(hl) 구간
      "sub": "",
      "status": "draft",         // draft → msg_ok(메시지 확정) → form_ok(폼 확정) — head 수정 시 form_ok는 msg_ok로 강등
      "form": {                  // 폼 스터디 선택 결과 (deck-spec slides[].p로 무변환 이관)
        "tpl": "before_after", "p": {}, "assumed": false, "pickedAt": 1723...
      }
    }
  ],
  "nextRowId": 4,
  "holes": [
    {
      "id": "h1", "type": 6, "atIds": ["c3"],
      "question": "기존 정기 라인 잠식은?", "fix": "물량 상한 명시",
      "disposition": null,       // null | "apply" | "verbal" | "reject"
      "memo": "",                // ★ 구두 대응 예상 문답 (F10 — disposition=verbal 필수)
      "reason": "",              // ★ 기각 사유 (F10 — disposition=reject 필수)
      "stale": false             // 정의서·관련 체인 수정 시 true — 재검토 필요 표시
    }
  ],
  "holesRunAt": 1723...          // 마지막 구멍 검사 시각 (0 = 미실시)
}
```

### `formstudy:runs:v2` — 폼 스터디 기록 (승률 사전)

```jsonc
[{
  "ts": 1723..., "deckId": "d17...", "rowId": "c3",   // ★ 역추적 키 (F10 — v1은 연결 키 부재)
  "msg": "...", "ctx": "...", "rel": "전환",
  "cands": ["before_after", "flow"], "pick": "before_after",
  "p": { }, "assumed": false                            // ★ 선택 파라미터 보존 (v1은 유실 — 지시서 복원 불가였음)
}]
```

상한 300건 유지(초과 시 오래된 것 삭제·화면에 명시). v1 키(`formstudy:runs:v1`)가 있으면 읽기 전용 참고로만 두고 병합하지 않는다.

## 상태 전이 규칙 (점검결과 항목 5-Q1)

| 사건 | 전이 |
|---|---|
| 정의서 저장 | holes 전건 `stale: true` |
| 체인 줄 head 수정 | 그 줄 `form_ok → msg_ok` 강등, 그 줄을 atIds로 갖는 holes `stale: true` |
| 체인 줄 삭제 | 그 줄을 atIds로 갖는 holes `stale: true` (atIds는 유지 — 라벨 해석은 방어적으로) |
| 구멍 재검사 | 기존 항목은 (type, atIds) 매칭으로 처분·메모 이월, 미매칭 기존 항목은 "이전 검출" 접힘 목록으로 보존 |
| 저장 시 updatedAt 불일치 | 덮어쓰기 확인 배너 (다중 탭 감지 — 병합은 과설계, 경고로 충분) |
