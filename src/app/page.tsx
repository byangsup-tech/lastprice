"use client";

import { useEffect, useRef, useState } from "react";
import CompareBar from "@/components/compare/CompareBar";
import DemoModeBanner from "@/components/controls/DemoModeBanner";
import FilterChips from "@/components/controls/FilterChips";
import GpsButton from "@/components/controls/GpsButton";
import RadiusChips from "@/components/controls/RadiusChips";
import SortSelect from "@/components/controls/SortSelect";
import DaycareDetailSheet from "@/components/detail/DaycareDetailSheet";
import MapViewLazy from "@/components/map/MapViewLazy";
import BottomSheet, { type Snap } from "@/components/sheet/BottomSheet";
import DaycareList from "@/components/sheet/DaycareList";
import { useCompareSelection } from "@/hooks/useCompareSelection";
import { EMPTY_FILTERS, useDaycares } from "@/hooks/useDaycares";
import { DEFAULT_CENTER } from "@/lib/demo-data";
import type { SortKey } from "@/lib/types";

export default function Home() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [radius, setRadius] = useState(1000);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("distance");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<Snap>("half");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, loading, error } = useDaycares(center, radius, filters, sort);
  const compare = useCompareSelection();

  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  // 최초 1회 사용법 안내
  useEffect(() => {
    const timer = setTimeout(
      () => showToast("지도를 탭하거나 📍 핀을 끌어 위치를 정해보세요"),
      800,
    );
    return () => clearTimeout(timer);
  }, []);

  const handleToggleCompare = (id: string) => {
    if (!compare.toggle(id)) {
      showToast("비교는 최대 3곳까지 선택할 수 있어요");
    }
  };

  const items = data?.items ?? [];
  const detail = items.find((d) => d.id === detailId) ?? null;
  const radiusLabel = radius < 1000 ? `${radius}m` : `${radius / 1000}km`;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <header className="z-[1100] shrink-0 bg-white px-4 pt-3 pb-2 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h1 className="shrink-0 text-sm font-extrabold whitespace-nowrap">
            🧒 우리동네 어린이집
          </h1>
          <RadiusChips value={radius} onChange={setRadius} />
        </div>
      </header>

      <div className="relative flex-1">
        <MapViewLazy
          center={center}
          radius={radius}
          daycares={items}
          compareIds={compare.ids}
          selectedId={detailId}
          onCenterChange={(lat, lng) => setCenter({ lat, lng })}
          onMarkerClick={(id) => setDetailId(id)}
        />

        <div className="pointer-events-none absolute inset-x-3 top-2 z-[1050]">
          {data && <DemoModeBanner source={data.source} />}
        </div>

        {sheetSnap !== "full" && (
          <GpsButton
            className="absolute right-3 z-[1050]"
            style={{
              bottom: sheetSnap === "peek" ? "184px" : "calc(48dvh + 16px)",
            }}
            onLocate={(lat, lng) => {
              setCenter({ lat, lng });
              showToast("현재 위치로 이동했어요");
            }}
            onError={showToast}
          />
        )}
      </div>

      <BottomSheet
        onSnapChange={setSheetSnap}
        header={
          <>
            <div className="flex items-center justify-between px-4 pt-1 pb-2">
              <p className="text-sm font-bold">
                반경 {radiusLabel} 내{" "}
                <span className="text-blue-600">{items.length}곳</span>
              </p>
              <SortSelect value={sort} onChange={setSort} />
            </div>
            <FilterChips filters={filters} onChange={setFilters} />
          </>
        }
      >
        <DaycareList
          items={items}
          loading={loading}
          error={error}
          compareIds={compare.ids}
          onToggleCompare={handleToggleCompare}
          onSelect={setDetailId}
        />
      </BottomSheet>

      <CompareBar ids={compare.ids} center={center} onClear={compare.clear} />

      {detail && (
        <DaycareDetailSheet
          daycare={detail}
          compared={compare.ids.includes(detail.id)}
          onToggleCompare={handleToggleCompare}
          onClose={() => setDetailId(null)}
          onCopied={() => showToast("주소가 복사되었습니다")}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-[1300] flex justify-center px-6">
          <p className="rounded-full bg-gray-900/90 px-4 py-2 text-xs font-medium text-white shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </div>
  );
}
