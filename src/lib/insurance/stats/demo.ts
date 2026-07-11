import type { DeathCauseRow, LifeExpectancyPoint } from "./types";

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
