# 🧒 우리동네 어린이집

내 위치(또는 지도에서 직접 지정한 위치) 기준으로 반경을 선택하면 근처 어린이집을 지도와 리스트로 보여주고, 최대 3곳을 나란히 비교할 수 있는 모바일 우선 웹앱입니다.

## 주요 기능

- **위치 지정**: 현재 위치(GPS) 버튼 또는 지도 탭/📍핀 드래그로 기준 위치 설정
- **반경 검색**: 500m / 1km / 2km / 3km 반경 내 어린이집 표시 (지도 마커 + 바텀시트 리스트)
- **의사결정 정보**: 유형(국공립/민간/가정 등), 정원/현원/**정원 여유**, 보육교직원 수와 교사 1인당 아동 수, 보육실 수·면적, 놀이터, CCTV, 통학차량, 인가일자, 거리, 전화
- **필터/정렬**: 유형 · 정원 여유 · 통학차량 · CCTV 필터, 거리순 · 정원 여유순 · 교사당 아동수 정렬
- **비교**: 2~3곳 선택 → 항목별 비교 테이블 (항목별 가장 좋은 값 초록색 하이라이트)

## 기술 스택

- Next.js (App Router, TypeScript) + Tailwind CSS — 모바일 우선 웹앱
- Leaflet + OpenStreetMap (react-leaflet) — API 키 불필요
- 데이터: [어린이집정보공개포털 보육정보공개 API](https://info.childcare.go.kr) (api.childcare.go.kr, 시군구 단위 조회)

## 실행 방법

```bash
npm install
npm run dev
# http://localhost:3000
```

API 키 없이 실행하면 **데모 모드**(강남/서초 일대 목업 데이터 84곳)로 동작하며, 상단에 안내 배너가 표시됩니다.

## 전국 실데이터 연동

1. [어린이집정보공개포털](https://info.childcare.go.kr)에서 보육정보공개 OPEN API 신청 후 인증키 발급
2. `.env.local` 파일 생성 (Vercel이면 Settings → Environment Variables):
   ```bash
   cp .env.local.example .env.local
   # CHILDCARE_API_KEY=발급받은_인증키
   ```
3. 서버 재시작 (Vercel이면 Redeploy)

이 API는 시군구 단위 조회만 지원하고 일 호출 한도(기본 1,000회)가 있어, **검색 위치 주변 시군구만 필요할 때 조회**하고 시군구별로 24시간 캐싱합니다(서버리스에서는 `/tmp`). 어떤 시군구가 조회됐는지는 `/api/daycares?...&debug=1`의 `meta` 필드로 확인할 수 있습니다. 호출 실패 시 만료된 캐시 → 데모 데이터 순으로 폴백합니다.

## 구조

```
src/
├── app/                # 메인(지도+리스트), /compare(비교), /api/daycares(반경 검색 API)
├── components/         # map(Leaflet), sheet(바텀시트/카드), controls(칩/정렬/GPS), detail, compare
├── lib/                # 오픈API 클라이언트, 캐시, haversine 반경 필터, 데모 데이터
└── hooks/              # useDaycares(디바운스 검색), useCompareSelection(비교 선택)
```

---

# 🛡️ 보험 상품개발 데스크 (`/insurance`)

## 4단계 — 데일리 도구화 · 규제 레이더 · 통계 확장 (현재)

- **데일리 도구화** (localStorage, 키 불필요): 관심 키워드 등록 → 매칭 카드
  하이라이트·"내 키워드만" 필터, 스크랩(☆ 토글, 스냅샷 저장, 전용 탭),
  오늘의 브리핑(24시간 신규 카테고리별 요약), 상품 유형 태그 클릭 필터
- **규제 레이더** (정책·공시 카테고리): 금감원 분쟁조정례(약관 설계 참고),
  금융위 규정변경예고(선행 신호), 열린국회정보 API 보험 의안 추적(`ASSEMBLY_API_KEY`)
- **통계 패널 확장**: 국고채 3/5/10년 금리 차트(`ECOS_API_KEY`, 예정이율 검토 참고),
  다빈도 질병 Top10(건강·제3보험 담보 참고)
- **위험률 패널 강화**: 암 조발생률 추이(국가암등록통계, 기존 KOSIS 키) +
  5년 생존율 타일, 연령대별 주요 질환 발생 곡선(HIRA), 법정감염병 주간 신고
  Top5(질병관리청) — HIRA·질병관리청은 `DATA_GO_KR_API_KEY` 하나로 커버
- **검색 수요 트렌드** (디지털 채널 신상품 아이디에이션): 네이버 데이터랩
  검색어트렌드 API로 보험 키워드 5개(`DATALAB_KEYWORDS`로 교체 가능)의 월별
  검색량 상대지수 비교 + "검색 수요 상승 1위" 타일. 기존 네이버 키 재사용
  (앱에 데이터랩 API 추가 등록 필요, 일 1,000회)
- **위험률·의료 카테고리** (인보험 위험률 개발 원천): KCI 논문(위험률·사망률·발생률,
  `KCI_API_KEY`), PubMed 한국 역학 논문(키 불필요), 통계청·질병관리청 통계 공표 감지,
  보건복지부 급여·수가 이벤트(건정심), 신의료기술·비급여 뉴스.
  글로벌: PubMed(GBD·암통계·기대수명), WHO 발표, arXiv 사망률 모형·장수리스크,
  Google News 글로벌 보건통계 — 전부 키 불필요

보험회사 상품개발 실무자를 위한 정보 대시보드. 국내외 보험 뉴스·정책/공시·신상품·리서치를
RSS와 공개 API로 자동 수집해 하나의 피드로 보여줍니다. (어린이집 앱과 같은 레포에 공존하며,
`/insurance` 경로에서 동작)

## 2단계 — 신상품 신호 + 위험률 통계 패널 (현재)

- **배타적사용권 스크레이퍼**: 생보협회(klia.or.kr)·손보협회(knia.or.kr) 신청·심의결과
  게시판 → 신상품 카테고리로 유입. 범용 게시판 파서(앵커 패턴 + 날짜 추출) 기반
- **보험연구원 리포트 스크레이퍼**: kiri.or.kr 자료 게시판 → 리서치 카테고리
- **`/insurance/stats` 위험률 통계 패널**: KOSIS 연동(무료 키)
  - 기대수명 추이 라인 차트 (전체/남/여, 호버 크로스헤어 툴팁)
  - 사망원인 Top 10 가로 막대 (인구 10만 명당 사망률)
  - 스탯 타일: 기대수명·남녀 차이·사망원인 1위
  - 키 없으면 근사치 예시로 동작(배지 표시), 24시간 캐시

※ 스크레이퍼 URL·KOSIS 테이블 파라미터는 실환경 검증 전 — 배포 후 소스 상태
스트립과 `src/lib/insurance/scrapers.ts`, `src/lib/insurance/stats/kosis.ts` 주석 참고.

## 1단계 — 뉴스·공시 스트림

| 카테고리 | 소스 | 방식 |
|---|---|---|
| 국내 뉴스 | 네이버 뉴스 검색 API, 한국보험신문·보험신보·보험매일 RSS | API 키 / RSS |
| 해외 뉴스 | Insurance Journal, Reinsurance News, Artemis, Coverager, Insurance Business, Life Insurance International | RSS |
| 정책·공시 | 금융위원회(정책브리핑 RSS), DART 보험사 공시 | RSS / API 키 |
| 신상품 | 배타적사용권(생보/손보협회), 네이버 뉴스(신상품·배타적사용권), Google News 日本(保険 新商品)·中国(保险 新产品), Coverager Product | 스크레이핑 / API 키 / RSS |
| 리서치 | McKinsey Insights(보험 필터), 네이버 뉴스(보험연구원) | RSS / API 키 |

- 신상품 카테고리: 시장 필터(🇰🇷한국/🇨🇳중국/🇯🇵일본/🌐글로벌) + 상품 유형 자동 태그
  (암, 건강·의료, 간병·치매, 연금·저축, 펫 등 — 한·중·일·영 키워드 분류)
- 제목 자동 번역: DeepL API(`DEEPL_API_KEY`, 무료 월 50만 자)로 일본어·중국어 제목을
  한국어로 번역해 원문과 함께 표시. 아이템별 영구 캐시로 같은 제목은 한 번만 번역.
  대상 언어는 `TRANSLATE_LANGS`(기본 `ja,zh`, 영어 포함은 `ja,zh,en`)
- 소스별 15분 서버 캐시(메모리+`/tmp`), 실패 시 만료 캐시 → 예시 데이터 순 폴백
- 소스별 수집 상태(정상/지연/실패/키 미설정/예시)를 UI 상태 스트립에 표시
- API 키 없이도 예시 데이터로 UI 확인 가능 (상단 배너로 명시)

### 설정

```bash
cp .env.local.example .env.local
# NAVER_CLIENT_ID / NAVER_CLIENT_SECRET — developers.naver.com (무료 일 25,000회)
# DART_API_KEY — opendart.fss.or.kr (무료 일 20,000건)
npm run dev
# http://localhost:3000/insurance
```

주의: RSS 피드 URL 상당수는 개발망 이그레스 차단으로 실환경 검증 전입니다.
배포 후 소스 상태 스트립에서 수집 실패 소스를 확인하고 `src/lib/insurance/sources.ts`를 조정하세요.

### 2단계 예정

배타적사용권 게시판(생보·손보협회) 스크레이핑, 보험연구원/보험개발원 리포트,
위험률 통계 패널(KOSIS·HIRA·질병관리청), 경쟁사 실적공시(CSM/VNB) 패널

```
src/lib/insurance/     # sources(레지스트리), rss(파서), naver/dart(클라이언트), collect(수집), cache, demo-data
src/app/insurance/     # 대시보드 UI
src/app/api/insurance/ # GET /api/insurance/feed
```

---

# 🎬 유튜브 롱폼 스튜디오 (`/youtube`, `npm run yt`)

주제 리서치부터 대본·음성·자막·영상 합성·썸네일·업로드까지 한 번에 이어지는 롱폼(8~15분) 자동 제작 파이프라인.
API 키가 하나도 없어도 동작하고(템플릿 대본 · Edge TTS · HTML 카드), 키를 넣을수록 품질이 올라갑니다.

```
research ──▶ script ──▶ voice ──▶ visuals ──▶ render ──▶ thumbnail ──▶ upload
 구글트렌드    Claude     Edge TTS   HTML 카드    ffmpeg      1280×720     YouTube
 뉴스·자동완성  (템플릿)   (OpenAI·   +Pexels     자막·BGM     Chromium     Data API
 유튜브·네이버            ElevenLabs) Chromium    켄번즈·챕터              (예약 공개)
```

## 빠른 시작 (Node 22.3 이상)

```bash
npm install
npm run yt -- doctor        # ffmpeg·Chromium·한글 폰트·키 상태 점검 (폰트 자동 다운로드)
npm run yt -- demo          # 키 없이 70초짜리 데모 영상 제작 → content/youtube/jobs/<id>/final.mp4
npm run yt -- research      # 주제 후보 25개 (점수·수요·경쟁·적합도·근거)
npm run yt -- new --candidate 1          # 1위 후보로 작업 생성   (또는 --topic "제목")
npm run yt -- run --job <id>             # 대본 → 음성 → 시각자료 → 합성 → 썸네일
npm run yt -- run --job <id> --upload --privacy private --publish-at 2026-09-10T09:00:00+09:00
npm run yt -- run --auto                 # 리서치 → 자동 선정 → 전체 제작 (적합 주제 없으면 생성 안 함)
npm run dev                              # http://localhost:3000/youtube 대시보드
```

각 단계는 입력 해시로 idempotent — 같은 입력이면 건너뛰고, `--force`로 다시 만듭니다.
`npm run yt -- script --job <id>`처럼 단계 하나만 실행할 수도 있습니다.
대시보드에서는 대본을 직접 고친 뒤 '음성·영상 생성'을 눌러 승인 단계를 둘 수 있습니다.

## 키 설정 (전부 선택)

| 키 | 용도 | 없으면 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 대본 생성(`claude-opus-5`)·리서치 후보 재정렬 | 템플릿 초안 대본 (파이프라인 검증용) |
| `PEXELS_API_KEY` | 장면별 스톡 사진/영상 배경 | 테마 색 HTML 카드 |
| `YOUTUBE_API_KEY` (+`YT_CHANNEL_ID`) | 리서치 검색량·경쟁도, 채널 업로드 이력으로 중복 방지 | 키 없는 소스만 사용 |
| `NAVER_CLIENT_ID/SECRET` | 네이버 뉴스 신호 (기존 보험 데스크 키 재사용) | 생략 |
| `OPENAI_API_KEY` / `ELEVENLABS_API_KEY`+`ELEVENLABS_VOICE_ID` | Edge 대신 다른 TTS (`YT_TTS_PROVIDER`) | Edge TTS (무료) |
| `YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN` | 업로드·썸네일·자막 등록 | 업로드 단계 건너뜀 |

리서치 키 없는 소스: 구글 트렌드(KR) RSS, 구글 뉴스 RSS(프로필 키워드), 구글/유튜브 자동완성, 위키백과 많이 본 문서.

### YouTube 업로드 토큰 발급

1. Google Cloud Console에서 프로젝트 생성 → **YouTube Data API v3** 사용 설정
2. OAuth 동의 화면(외부) 구성 후 **테스트 사용자**에 본인 계정 추가
3. 사용자 인증 정보 → OAuth 클라이언트 ID → 유형 **데스크톱 앱** → ID/Secret을 `.env.local`에
4. `npm run yt -- auth` → 브라우저에서 동의 → 출력된 `YOUTUBE_REFRESH_TOKEN`을 `.env.local`에
   (앱이 '테스트' 상태면 토큰이 7일 후 만료 — 앱 게시 또는 주기적 재발급)

`--publish-at`을 주면 유튜브 규칙에 따라 `private`으로 올라가고 지정 시각에 공개됩니다.
커스텀 썸네일 등록은 전화번호 인증된 채널만 가능하며, 실패해도 업로드 자체는 성공으로 처리합니다.

## 채널 프로필 — `content/youtube/channel.json`

| 필드 | 설명 |
|---|---|
| `name`, `niche`, `audience`, `tone` | 대본 프롬프트에 그대로 반영 |
| `keywords` | 리서치 뉴스 검색어 + 적합도(fit) 계산 (≤ 8개 권장) |
| `avoid` | 제목·뉴스에 걸리면 후보 제외 (내장 연예·스포츠·사건 마커도 적용) |
| `targetMinutes` | 목표 길이 — 분당 약 400자 기준으로 대본 분량 산정 |
| `voice`, `voiceRate` | Edge 보이스(`ko-KR-InJoonNeural`/`ko-KR-SunHiNeural`)와 속도(`+5%`) |
| `theme` | 카드·썸네일·진행 바 색상 |
| `cta` | 아웃트로 멘트 |
| `bgmPath` | 배경음악 mp3 (사이드체인 덕킹) — 저작권 확인 필수 |
| `visualMode` | `auto`(Pexels 키 있으면 photos) / `cards` / `photos` / `videos` |

## 산출물 — `content/youtube/jobs/<id>/` (gitignore)

```
job.json            단계 상태·옵션·산출물 경로
script.json         대본 (훅 → 챕터 → 아웃트로, 장면별 나레이션·화면 문구·비주얼 키워드)
metadata.json       유튜브 제목·설명(타임라인 챕터 포함)·태그
audio/scene-001.mp3 …  장면별 나레이션 + 단어 타이밍(json) · timeline.json
frames/scene-001.png … 장면 카드 · plan.json · credits.json(Pexels 출처)
subtitles.srt       자막 (영상에 번인 + 업로드 시 자막 트랙 등록)
final.mp4           1920×1080 25fps H.264/AAC (자막·진행 바·켄 번즈·BGM)
thumbnail.png       1280×720
logs/pipeline.log · logs/render.log
```

## GitHub Actions — `.github/workflows/youtube-longform.yml`

`Actions → youtube-longform → Run workflow`에서 주제(비우면 자동 선정)·업로드 여부·공개 범위·예약 시각을 입력하면
ubuntu 러너가 ffmpeg·Noto CJK·Chromium을 설치하고 전체 파이프라인을 실행합니다.
결과(mp4·썸네일·대본·메타데이터·자막·로그)는 7일간 워크플로 아티팩트로 남고, Secrets에 키를 넣으면 업로드까지 됩니다.
주간 자동 제작은 파일의 `schedule` 주석을 풀면 됩니다(사용한 주제 이력은 Actions 캐시로 유지).

## 한계와 주의

- 영상 합성은 로컬 CLI나 GitHub Actions에서만 실행됩니다. Vercel 등 서버리스 배포에서는 대시보드가 읽기 전용입니다.
- 대시보드는 로컬 도구로 설계됐습니다. `next start`(프로덕션)에서는 `YT_ALLOW_LOCAL_RUN=1`을 명시해야 대시보드 실행이 켜지고,
  외부에 노출한다면 `YT_DASHBOARD_TOKEN`을 설정하세요 — 작업 생성·대본 저장·실행·리서치 새로고침에 같은 값의 토큰(상태 스트립 🔑)이 필요해집니다.
- 템플릿 모드 대본은 구조 검증용 초안입니다. 실제 채널 운영에는 `ANTHROPIC_API_KEY`를 설정하고, 대시보드에서 대본을 검토·수정한 뒤 음성 단계로 넘기세요.
- Edge TTS는 마이크로소프트의 비공식 엔드포인트를 사용합니다. 서비스 변경 시 `YT_TTS_PROVIDER=openai|elevenlabs`로 전환할 수 있습니다.
- BGM은 저작권이 확인된 음원만 사용하세요(YouTube 오디오 라이브러리 등). 스톡 사진·영상 출처(Pexels)는 설명문에 자동 표기됩니다.
