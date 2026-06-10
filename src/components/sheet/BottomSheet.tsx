"use client";

import { useRef, useState } from "react";

export type Snap = "peek" | "half" | "full";

const PEEK_PX = 168;

function snapHeight(snap: Snap): number {
  const vh = window.innerHeight;
  if (snap === "peek") return PEEK_PX;
  if (snap === "half") return Math.round(vh * 0.48);
  return Math.round(vh * 0.88);
}

interface BottomSheetProps {
  /** 핸들 아래 항상 보이는 영역 (요약/필터) */
  header: React.ReactNode;
  children: React.ReactNode;
  /** 시트 높이에 맞춰 지도 위 요소(FAB 등)를 배치할 수 있도록 알림 */
  onSnapChange?: (snap: Snap) => void;
}

export default function BottomSheet({
  header,
  children,
  onSnapChange,
}: BottomSheetProps) {
  const [snap, setSnapState] = useState<Snap>("half");
  const setSnap = (next: Snap) => {
    setSnapState(next);
    onSnapChange?.(next);
  };
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; height: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = { y: e.clientY, height: dragHeight ?? snapHeight(snap) };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const delta = dragStart.current.y - e.clientY;
    const next = Math.min(
      Math.round(window.innerHeight * 0.92),
      Math.max(80, dragStart.current.height + delta),
    );
    setDragHeight(next);
  };

  const onPointerUp = () => {
    if (!dragStart.current) return;
    const h = dragHeight ?? snapHeight(snap);
    dragStart.current = null;
    setDragHeight(null);
    // 가장 가까운 스냅 지점으로
    const candidates: Snap[] = ["peek", "half", "full"];
    let best: Snap = "half";
    let bestDist = Infinity;
    for (const c of candidates) {
      const dist = Math.abs(snapHeight(c) - h);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    setSnap(best);
  };

  const heightStyle =
    dragHeight !== null
      ? { height: dragHeight }
      : snap === "peek"
        ? { height: PEEK_PX }
        : snap === "half"
          ? { height: "48dvh" }
          : { height: "88dvh" };

  return (
    <div
      style={heightStyle}
      className={`fixed inset-x-0 bottom-0 z-[1100] flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.18)] ${
        dragHeight === null ? "transition-[height] duration-200 ease-out" : ""
      }`}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="shrink-0 cursor-grab touch-none pt-2.5 pb-1"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-gray-300" />
      </div>
      <div className="shrink-0">{header}</div>
      <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}
