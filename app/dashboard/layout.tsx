"use client";
import Sidebar from "@/components/layout/Sidebar";
import CreateClusterModal from "@/components/modals/CreateClusterModal";
import { useUIStore } from "@/store/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const zenMode = useUIStore((s) => s.zenMode);
  return (
    <div className="flex h-screen overflow-hidden">
      {!zenMode && <Sidebar />}
      <main className="flex-1 overflow-y-auto bg-surface min-w-0">
        {children}
      </main>
      <CreateClusterModal />
    </div>
  );
}
