"use client";

import { formatDistance } from "@/lib/geo";
import {
  availability,
  childPerTeacher,
  type DaycareWithDistance,
} from "@/lib/types";
import { typeBadgeClass } from "@/lib/ui";

interface DaycareDetailSheetProps {
  daycare: DaycareWithDistance;
  compared: boolean;
  onToggleCompare: (id: string) => void;
  onClose: () => void;
  onCopied: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-50 py-2.5 text-sm">
      <span className="shrink-0 text-gray-400">{label}</span>
      <span className="text-right font-medium text-gray-800">{value}</span>
    </div>
  );
}

export default function DaycareDetailSheet({
  daycare: d,
  compared,
  onToggleCompare,
  onClose,
  onCopied,
}: DaycareDetailSheetProps) {
  const avail = availability(d);
  const ratio = childPerTeacher(d);
  const fillPercent =
    d.capacity > 0 ? Math.min(100, Math.round((d.current / d.capacity) * 100)) : 0;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(d.address);
      onCopied();
    } catch {
      // 클립보드 미지원 환경 무시
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col justify-end bg-black/40">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="flex-1"
      />
      <div className="flex max-h-[88dvh] flex-col rounded-t-2xl bg-white">
        <div className="flex items-start gap-2 px-4 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${typeBadgeClass(d.type)}`}
              >
                {d.type}
              </span>
              {d.status !== "정상" && (
                <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
                  {d.status}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-lg font-bold">{d.name}</h2>
            <p className="text-xs text-gray-400">
              현재 위치에서 {formatDistance(d.distance)}
            </p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-500"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-4">
          {/* 정원/현원 게이지 */}
          <div className="mt-1 rounded-xl bg-gray-50 p-3">
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                정원 {d.capacity} · 현원 {d.current}
              </span>
              {avail > 0 ? (
                <span className="font-bold text-green-600">여유 {avail}명</span>
              ) : (
                <span className="font-bold text-red-500">정원 마감</span>
              )}
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                style={{ width: `${fillPercent}%` }}
                className={`h-full ${fillPercent >= 100 ? "bg-red-400" : "bg-green-500"}`}
              />
            </div>
          </div>

          <div className="mt-2">
            <Row
              label="보육교직원"
              value={
                <>
                  {d.staffCount}명
                  {ratio !== null && (
                    <span className="text-gray-400"> · 교사 1인당 {ratio}명</span>
                  )}
                </>
              }
            />
            <Row
              label="보육실"
              value={`${d.roomCount}실${d.roomArea ? ` · ${d.roomArea}㎡` : ""}`}
            />
            <Row label="놀이터" value={`${d.playgroundCount}개`} />
            <Row label="CCTV" value={`${d.cctvCount}대`} />
            <Row label="통학차량" value={d.hasBus ? "운영" : "미운영"} />
            {d.approvedAt && <Row label="인가일자" value={d.approvedAt} />}
            <Row
              label="주소"
              value={
                <button
                  type="button"
                  onClick={copyAddress}
                  className="text-left underline decoration-gray-300 underline-offset-2"
                >
                  {d.address} 📋
                </button>
              }
            />
            {d.tel && (
              <Row
                label="전화"
                value={
                  <a href={`tel:${d.tel}`} className="text-blue-600">
                    {d.tel}
                  </a>
                }
              />
            )}
            {d.homepage && (
              <Row
                label="홈페이지"
                value={
                  <a
                    href={d.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-blue-600 underline underline-offset-2"
                  >
                    바로가기
                  </a>
                }
              />
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => onToggleCompare(d.id)}
              className={`flex-1 rounded-xl py-3 text-sm font-bold ${
                compared
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                  : "bg-blue-600 text-white"
              }`}
            >
              {compared ? "✓ 비교에서 제거" : "비교에 추가"}
            </button>
            {d.tel && (
              <a
                href={`tel:${d.tel}`}
                className="flex-1 rounded-xl bg-gray-900 py-3 text-center text-sm font-bold text-white"
              >
                전화하기
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
