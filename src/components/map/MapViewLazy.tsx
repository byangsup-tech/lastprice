"use client";

import dynamic from "next/dynamic";

// Leaflet은 import 시점에 window를 참조하므로 SSR에서 제외
const MapViewLazy = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-400">
      지도 로딩 중…
    </div>
  ),
});

export default MapViewLazy;
