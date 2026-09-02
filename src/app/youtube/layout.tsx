import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "유튜브 롱폼 스튜디오",
  description: "주제 리서치 → 대본 → 음성 → 영상 합성 → 썸네일 → 업로드 자동화 대시보드",
};

export default function YoutubeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-full bg-gray-50">{children}</div>;
}
