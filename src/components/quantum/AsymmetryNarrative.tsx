import { COMPANIES, FACTION_COLOR } from "@/lib/quantum-data";

/** 미국(민간 상장) vs 중국(국가 주도·비상장) 구도 카드 */
export default function AsymmetryNarrative() {
  const usListed = COMPANIES.filter((c) => c.faction === "US" && c.listed).length;
  const cnListed = COMPANIES.filter((c) => c.faction === "CN" && c.listed).length;
  const cnPrivate = COMPANIES.filter(
    (c) => c.faction === "CN" && !c.listed,
  ).length;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div
        className="rounded-2xl border bg-white p-4 sm:p-6"
        style={{ borderColor: FACTION_COLOR.US }}
      >
        <h3 className="mb-2 text-base font-bold" style={{ color: FACTION_COLOR.US }}>
          🇺🇸 미국 — 민간 상장 자본 시장
        </h3>
        <p className="text-sm text-gray-600">
          순수 양자기업 <strong>{usListed}곳</strong>이 나스닥 등에 상장돼 시총·
          밸류에이션이 투명하게 드러납니다. 벤처·공모 자본이 하드웨어부터
          소프트웨어·클라우드까지 풀스택을 분산 육성합니다.
        </p>
        <ul className="mt-3 space-y-1 text-xs text-gray-500">
          <li>· 강점: 게이트형 하드웨어·SW 생태계, 민간 자본, 인재 풀</li>
          <li>· 약점: 높은 밸류에이션·변동성, 통신 인프라는 상대적 후발</li>
        </ul>
      </div>

      <div
        className="rounded-2xl border bg-white p-4 sm:p-6"
        style={{ borderColor: FACTION_COLOR.CN }}
      >
        <h3 className="mb-2 text-base font-bold" style={{ color: FACTION_COLOR.CN }}>
          🇨🇳 중국 — 국가 주도·비상장 중심
        </h3>
        <p className="text-sm text-gray-600">
          상장 순수 플레이어는 <strong>{cnListed}곳</strong>(국盾량자)에 그치고,
          본원·国仪 등 핵심 기업 <strong>{cnPrivate}곳 이상</strong>은 국유·비상장
          이라 시총 비교가 어렵습니다. 정부 주도로 양자통신·인프라를 집중 육성합니다.
        </p>
        <ul className="mt-3 space-y-1 text-xs text-gray-500">
          <li>· 강점: 양자통신/QKD, 국가 조정·자금, 제조 역량</li>
          <li>· 약점: 상장 자본 시장 노출 제한, 데이터 투명성 낮음</li>
        </ul>
      </div>
    </section>
  );
}
