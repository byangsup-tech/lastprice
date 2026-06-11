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
