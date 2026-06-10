"use client";

import { useState } from "react";

interface GpsButtonProps {
  onLocate: (lat: number, lng: number) => void;
  onError: (message: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function GpsButton({
  onLocate,
  onError,
  className,
  style,
}: GpsButtonProps) {
  const [locating, setLocating] = useState(false);

  const locate = () => {
    if (!navigator.geolocation) {
      onError("이 브라우저는 위치 기능을 지원하지 않습니다");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onLocate(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        onError("위치 권한이 거부되어 현재 위치를 사용할 수 없습니다");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <button
      type="button"
      onClick={locate}
      aria-label="현재 위치로 이동"
      style={style}
      className={`flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-gray-200 active:bg-gray-50 ${className ?? ""}`}
    >
      {locating ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-blue-600"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
