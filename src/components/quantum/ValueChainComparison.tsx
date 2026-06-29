"use client";

import { useState } from "react";
import {
  COMPANIES,
  FACTION_COLOR,
  VALUE_CHAIN,
  type Company,
  type Faction,
  type StageId,
} from "@/lib/quantum-data";
import { fmtUsdB } from "@/lib/quantum-format";
import type { Quote } from "@/lib/quantum-quotes";

interface Props {
  quotes: Quote[];
}

interface StageSide {
  companies: Company[];
  /** 상장사 시총 합계 (10억 USD) */
  capUsd: number;
}

function sideFor(
  stage: StageId,
  faction: Faction,
  capByTicker: Map<string, number>,
): StageSide {
  const companies = COMPANIES.filter(
    (c) => c.faction === faction && c.stages.includes(stage),
  );
  const capUsd = companies.reduce(
    (sum, c) => sum + (capByTicker.get(c.ticker) ?? 0),
    0,
  );
  return { companies, capUsd };
}

/** 밸류체인 단계별 미국 vs 중국 비교 (대시보드 핵심 축) */
export default function ValueChainComparison({ quotes }: Props) {
  const [active, setActive] = useState<StageId | null>(null);
  const capByTicker = new Map(quotes.map((q) => [q.ticker, q.marketCapUsd]));

  // 양방향 막대 정규화를 위한 최대 시총
  const maxCap = Math.max(
    1,
    ...VALUE_CHAIN.flatMap((s) => [
      sideFor(s.id, "US", capByTicker).capUsd,
      sideFor(s.id, "CN", capByTicker).capUsd,
    ]),
  );

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">밸류체인 단계별 비교</h2>
        <div className="flex items-center gap-3 text-xs font-medium">
          <span style={{ color: FACTION_COLOR.US }}>🇺🇸 미국</span>
          <span style={{ color: FACTION_COLOR.CN }}>🇨🇳 중국</span>
        </div>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        막대 길이 = 해당 단계 상장 순수 양자기업의 시총 합계. 단계를 누르면 기업
        목록이 펼쳐집니다.
      </p>

      <div className="space-y-3">
        {VALUE_CHAIN.map((stage) => {
          const us = sideFor(stage.id, "US", capByTicker);
          const cn = sideFor(stage.id, "CN", capByTicker);
          const isOpen = active === stage.id;
          return (
            <div key={stage.id} className="border-b border-gray-100 pb-3">
              <button
                type="button"
                onClick={() => setActive(isOpen ? null : stage.id)}
                className="w-full text-left"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800">
                    {stage.icon} {stage.label}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {isOpen ? "▲ 접기" : "▼ 기업 보기"}
                  </span>
                </div>
                {/* 모바일: 미·중 두 줄로 스택 (단방향 막대) */}
                <div className="space-y-1 sm:hidden">
                  <StageBarRow
                    faction="US"
                    cap={us.capUsd}
                    maxCap={maxCap}
                  />
                  <StageBarRow
                    faction="CN"
                    cap={cn.capUsd}
                    maxCap={maxCap}
                  />
                </div>

                {/* 데스크톱: 양방향 막대 좌(미국) / 우(중국) */}
                <div className="hidden items-center gap-2 sm:flex">
                  <div className="flex flex-1 justify-end">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-gray-500">
                        {fmtUsdB(us.capUsd)}
                      </span>
                      <div className="h-4 w-32 overflow-hidden rounded-l-full bg-gray-100 sm:w-48">
                        <div
                          className="ml-auto h-full rounded-l-full"
                          style={{
                            width: `${(us.capUsd / maxCap) * 100}%`,
                            background: FACTION_COLOR.US,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-1 justify-start">
                    <div className="flex items-center gap-1">
                      <div className="h-4 w-32 overflow-hidden rounded-r-full bg-gray-100 sm:w-48">
                        <div
                          className="h-full rounded-r-full"
                          style={{
                            width: `${(cn.capUsd / maxCap) * 100}%`,
                            background: FACTION_COLOR.CN,
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-500">
                        {fmtUsdB(cn.capUsd)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <StageCompanyList companies={us.companies} faction="US" />
                  <StageCompanyList companies={cn.companies} faction="CN" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** 모바일용 단방향 막대 한 줄 (진영 라벨 + 막대 + 시총값) */
function StageBarRow({
  faction,
  cap,
  maxCap,
}: {
  faction: Faction;
  cap: number;
  maxCap: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-sm">
        {faction === "US" ? "🇺🇸" : "🇨🇳"}
      </span>
      <div className="h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full"
          style={{
            width: `${(cap / maxCap) * 100}%`,
            background: FACTION_COLOR[faction],
          }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-xs font-medium text-gray-500">
        {fmtUsdB(cap)}
      </span>
    </div>
  );
}

function StageCompanyList({
  companies,
  faction,
}: {
  companies: Company[];
  faction: Faction;
}) {
  if (companies.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-2 text-xs text-gray-400">
        해당 단계 상장 기업 없음
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {companies.map((c) => (
        <li
          key={c.name}
          className="rounded-lg bg-gray-50 p-2 text-xs"
          style={{ borderLeft: `3px solid ${FACTION_COLOR[faction]}` }}
        >
          <div className="flex items-center gap-1 font-semibold text-gray-800">
            {c.name}
            {!c.listed && (
              <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">
                비상장
              </span>
            )}
          </div>
          <div className="text-gray-500">
            {c.tech} · {c.blurb}
          </div>
        </li>
      ))}
    </ul>
  );
}
