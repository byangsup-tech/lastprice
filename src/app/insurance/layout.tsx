import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "보험 상품개발 데스크",
  description:
    "보험 상품개발 실무자를 위한 뉴스·정책·신상품·리서치 통합 피드",
};

export default function InsuranceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-full bg-gray-50">{children}</div>;
}
