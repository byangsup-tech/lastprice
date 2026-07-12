import type {
  AgeProfileData,
  CancerIncidencePoint,
  DeathCauseRow,
  FrequentDiseaseRow,
  InfectiousDiseaseRow,
  InterestRatePoint,
  LifeExpectancyPoint,
} from "./types";

/**
 * 예시 통계 — KOSIS 키가 없거나 수집 실패 시 패널 UI 확인용.
 * 공표 통계의 근사치이며 정확한 수치가 아님. UI에 "예시" 배지로 명시된다.
 */

export const DEMO_LIFE_EXPECTANCY: LifeExpectancyPoint[] = [
  { year: 2000, total: 76.0, male: 72.3, female: 79.7 },
  { year: 2002, total: 76.8, male: 73.1, female: 80.1 },
  { year: 2004, total: 77.8, male: 74.2, female: 81.1 },
  { year: 2006, total: 78.8, male: 75.4, female: 82.0 },
  { year: 2008, total: 79.6, male: 76.2, female: 82.7 },
  { year: 2010, total: 80.2, male: 76.8, female: 83.6 },
  { year: 2012, total: 80.9, male: 77.6, female: 84.2 },
  { year: 2014, total: 81.8, male: 78.6, female: 85.0 },
  { year: 2016, total: 82.4, male: 79.3, female: 85.4 },
  { year: 2018, total: 82.7, male: 79.7, female: 85.7 },
  { year: 2020, total: 83.5, male: 80.5, female: 86.5 },
  { year: 2022, total: 82.7, male: 79.9, female: 85.6 },
  { year: 2023, total: 83.5, male: 80.6, female: 86.4 },
];

export const DEMO_DEATH_CAUSES_YEAR = 2023;

export const DEMO_DEATH_CAUSES: DeathCauseRow[] = [
  { cause: "악성신생물(암)", ratePer100k: 166.7 },
  { cause: "심장 질환", ratePer100k: 64.8 },
  { cause: "폐렴", ratePer100k: 57.5 },
  { cause: "뇌혈관 질환", ratePer100k: 47.3 },
  { cause: "고의적 자해(자살)", ratePer100k: 27.3 },
  { cause: "알츠하이머병", ratePer100k: 22.5 },
  { cause: "당뇨병", ratePer100k: 17.7 },
  { cause: "고혈압성 질환", ratePer100k: 15.6 },
  { cause: "패혈증", ratePer100k: 15.0 },
  { cause: "간 질환", ratePer100k: 14.3 },
];

/** 국고채 월별 금리 근사치 (%) — 최근 24개월 */
export const DEMO_TREASURY_YIELDS: InterestRatePoint[] = [
  { month: "2024-07", y3: 3.05, y5: 3.12, y10: 3.25 },
  { month: "2024-08", y3: 2.98, y5: 3.05, y10: 3.18 },
  { month: "2024-09", y3: 2.88, y5: 2.96, y10: 3.05 },
  { month: "2024-10", y3: 2.92, y5: 3.0, y10: 3.1 },
  { month: "2024-11", y3: 2.85, y5: 2.92, y10: 3.02 },
  { month: "2024-12", y3: 2.68, y5: 2.75, y10: 2.88 },
  { month: "2025-01", y3: 2.6, y5: 2.68, y10: 2.82 },
  { month: "2025-02", y3: 2.58, y5: 2.66, y10: 2.8 },
  { month: "2025-03", y3: 2.52, y5: 2.62, y10: 2.78 },
  { month: "2025-04", y3: 2.45, y5: 2.55, y10: 2.72 },
  { month: "2025-05", y3: 2.4, y5: 2.5, y10: 2.68 },
  { month: "2025-06", y3: 2.42, y5: 2.53, y10: 2.72 },
  { month: "2025-07", y3: 2.45, y5: 2.57, y10: 2.78 },
  { month: "2025-08", y3: 2.48, y5: 2.6, y10: 2.82 },
  { month: "2025-09", y3: 2.5, y5: 2.63, y10: 2.86 },
  { month: "2025-10", y3: 2.53, y5: 2.66, y10: 2.9 },
  { month: "2025-11", y3: 2.55, y5: 2.7, y10: 2.95 },
  { month: "2025-12", y3: 2.58, y5: 2.73, y10: 2.98 },
  { month: "2026-01", y3: 2.6, y5: 2.76, y10: 3.02 },
  { month: "2026-02", y3: 2.62, y5: 2.78, y10: 3.05 },
  { month: "2026-03", y3: 2.6, y5: 2.76, y10: 3.03 },
  { month: "2026-04", y3: 2.63, y5: 2.8, y10: 3.08 },
  { month: "2026-05", y3: 2.65, y5: 2.82, y10: 3.1 },
  { month: "2026-06", y3: 2.68, y5: 2.85, y10: 3.12 },
];

/** 암 조발생률 근사치 — 인구 10만 명당 (국가암등록통계) */
export const DEMO_CANCER_INCIDENCE: CancerIncidencePoint[] = [
  { year: 2000, total: 214, male: 232, female: 197 },
  { year: 2002, total: 238, male: 255, female: 222 },
  { year: 2004, total: 265, male: 280, female: 251 },
  { year: 2006, total: 306, male: 315, female: 297 },
  { year: 2008, total: 350, male: 355, female: 345 },
  { year: 2010, total: 405, male: 407, female: 403 },
  { year: 2012, total: 445, male: 442, female: 449 },
  { year: 2014, total: 427, male: 425, female: 429 },
  { year: 2016, total: 452, male: 447, female: 457 },
  { year: 2018, total: 477, male: 476, female: 478 },
  { year: 2020, total: 482, male: 488, female: 477 },
  { year: 2022, total: 522, male: 542, female: 502 },
];

/** 암 5년 상대생존율 근사치 (%) */
export const DEMO_CANCER_SURVIVAL = { rate: 72.9, period: "2018–2022" };

/** 연령대별 주요 질환 연간 진료인원 근사치 (만 명) — 발생 곡선 형태 참고용 */
export const DEMO_AGE_PROFILE: AgeProfileData = {
  ageBands: ["0–9", "10–19", "20–29", "30–39", "40–49", "50–59", "60–69", "70–79", "80+"],
  series: [
    { name: "악성신생물(암)", values: [1.1, 1.5, 3.2, 8.5, 19, 37, 52, 41, 18] },
    { name: "심장 질환", values: [0.4, 0.6, 1.8, 5, 14, 34, 55, 58, 35] },
    { name: "뇌혈관 질환", values: [0.2, 0.4, 1.1, 3, 9, 22, 38, 45, 30] },
  ],
};

/** 법정감염병 주간 신고 건수 근사치 */
export const DEMO_INFECTIOUS: InfectiousDiseaseRow[] = [
  { disease: "인플루엔자 (의사환자)", weeklyCases: 12400 },
  { disease: "코로나19", weeklyCases: 8600 },
  { disease: "수족구병", weeklyCases: 1520 },
  { disease: "수두", weeklyCases: 940 },
  { disease: "백일해", weeklyCases: 610 },
];

/** 다빈도 질병 진료인원 근사치 (명, 외래 기준) */
export const DEMO_FREQUENT_DISEASES: FrequentDiseaseRow[] = [
  { disease: "치은염 및 치주질환", patients: 18100000 },
  { disease: "급성 기관지염", patients: 15300000 },
  { disease: "혈관운동성·앨러지성 비염", patients: 7600000 },
  { disease: "본태성 고혈압", patients: 7500000 },
  { disease: "치아우식", patients: 6400000 },
  { disease: "등통증", patients: 6000000 },
  { disease: "위염 및 십이지장염", patients: 5200000 },
  { disease: "급성 편도염", patients: 4500000 },
  { disease: "당뇨병", patients: 3800000 },
  { disease: "알레르기성 결막염", patients: 3700000 },
];
