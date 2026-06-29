import type { Metadata } from "next";
import QuantumDashboard from "@/components/quantum/QuantumDashboard";

export const metadata: Metadata = {
  title: "미국 vs 중국 양자 산업 대시보드",
  description:
    "순수 양자 상장사의 밸류체인·시가총액·밸류에이션·성장 잠재력으로 미국과 중국의 양자 산업 대결을 비교합니다.",
};

export default function QuantumPage() {
  return (
    <main className="min-h-full bg-gray-50">
      <QuantumDashboard />
    </main>
  );
}
