"use client";
import Sidebar from "@/components/layout/Sidebar";
import CreateClusterModal from "@/components/modals/CreateClusterModal";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[#0f1117]">
        {children}
      </main>
      <CreateClusterModal />
    </div>
  );
}
