# 덱보드 storage 스키마 v2 (window.storage)

점검결과 F10 픽스 반영판. 사용자별 격리(아티팩트 특성) — 혼자 사용 전제.
마이그레이션 판별은 각 값의 `schemaVersion`으로 한다.

**덱 본문(`deckboard:deck:{id}`)의 v1은 배포된 적 없으므로 마이그레이션 코드를 두지 않는다.** 대신 저장된 값이 결손일 수 있으므로(수기 편집·부분 백업 복원) `normalizeDeck()`이 열기·가져오기 경로에서 결손 필드를 보정한다 — 보정 없이 렌더하면 `deck.holes.filter` 같은 접근에서 아티팩트 전체가 흰 화면이 된다.

**폼 스터디 기록(`formstudy:runs:*`)의 v1은 배포된 적 있다** (구 폼 스터디 아티팩트 `handoff-v0.1/form-study.jsx`가 기록을 남겼다). 아래 이월 규칙을 따른다.

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
  "archivedHoles": [],           // 재검사에서 미재현된 항목 중 처분·메모가 붙어 있던 것 (최근 100건)
  "holesRunAt": 1723...          // 마지막 구멍 검사 시각 (0 = 미실시)
}
```

`chain[]` 항목의 필드는 위 6개(`id`·`label`·`head`·`sub`·`status`·`form`)가 전부다. 골격 삽입 시 붙던 `seg`는 어디서도 소비되지 않아 제거했다.

**처분 완료의 정의**: `disposition`이 설정된 것만으로는 부족하다. 룰북 §7의 필수 입력까지 채워져야 완료로 센다 — 구두 대응은 `memo`, 기각은 `reason`. 코드에서는 `holeSettled(h)`가 이 판정을 담당하며 탭 배지·내보내기 경고가 모두 이 함수를 쓴다.

### `formstudy:runs:v2` — 폼 스터디 기록 (승률 사전)

```jsonc
[{
  "ts": 1723..., "deckId": "d17...", "rowId": "c3",   // ★ 역추적 키 (F10 — v1은 연결 키 부재)
  "msg": "...", "ctx": "...", "rel": "전환",
  "cands": ["before_after", "flow"], "pick": "before_after",
  "p": { }, "assumed": false                            // ★ 선택 파라미터 보존 (v1은 유실 — 지시서 복원 불가였음)
}]
```

상한 300건 유지(초과 시 오래된 것 삭제·화면에 명시).

**v1 이월 규칙**: v2가 비어 있을 때만 `formstudy:runs:v1`을 읽어 최대 250건(`MIGRATE_CAP` — 신규 기록 여유분)을 1회 이월한다. 이월 후 v2가 비지 않으므로 반복 실행이 자연 방지되고, `ts` 기준 dedupe가 안전망으로 남는다(v2만 외부에서 지워진 경우에도 중복이 쌓이지 않음). 정규화 필드:

| 필드 | 이월 값 | 이유 |
|---|---|---|
| `deckId`·`rowId` | `null` | v1에는 덱·줄 연결 정보가 없음 |
| `p` | `null` | v1은 파라미터를 저장하지 않음 — **제작 지시서 복원 불가** |
| `assumed` | `null` | v1에 없던 필드. `false`로 단정하지 않는다(수치 창작 금지 규정의 정신) |
| `ctx` | `""` | v1에 없음 |
| `from` | `"v1"` | 부분 기록 표시 — 집계에서 구분 |

v1의 `pick` 값(시드 9종)은 전부 현행 관계어 사전 15종에 포함되므로 템플릿 리매핑은 불필요하다.

기록의 소비자: 폼 스터디 모달 하단의 "이기는 형태" 누적 표시(`pickCounts`). 이월된 v1 기록도 여기 집계된다.

## 상태 전이 규칙 (점검결과 항목 5-Q1)

| 사건 | 전이 |
|---|---|
| 정의서 문항·프라이어·아키타입 **변경** | holes 전건 `stale: true`. 판정은 blur가 아니라 **값 변경 시점**에 한다 — blur 기준이면 값을 안 고친 포커스 통과에서 오탐이 나고, 반대로 blur 없이 탭을 벗어나면 표시를 놓친다 |
| 체인 줄 head 수정 | 그 줄 `form_ok → msg_ok` 강등, 그 줄을 atIds로 갖는 holes `stale: true` |
| 체인 줄 삭제 | 그 줄을 atIds로 갖는 holes `stale: true` (atIds는 유지 — 라벨 해석은 방어적으로) |
| 체인 줄 **순서 변경** | holes 전건 `stale: true` — 체인 순서가 곧 논증 순서라 링크 기반 구멍(비약·내부 충돌)이 재검토 대상이 된다 |
| 구멍 재검사 | 기존 항목은 (type, atIds) 매칭으로 처분·메모 이월. 미매칭 항목 중 처분·메모가 있던 것은 `archivedHoles`에 **덱 필드로 보존**(화면 로컬 state면 탭 이동에 소실된다) |
| 저장 시 updatedAt 불일치 | 덮어쓰기 확인 배너 (다중 탭 감지 — 병합은 과설계, 경고로 충분) |
| 저장 중 새 편집 유입 | 저장 완료 시 현재 덱 참조가 저장 대상과 다르면 dirty 플래그를 내리지 않는다 — 내리면 다음 디바운스가 "변경 없음"으로 보고 마지막 편집을 조용히 버린다 |
