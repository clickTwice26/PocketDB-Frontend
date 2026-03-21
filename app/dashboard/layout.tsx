"use client";
import Sidebar from "@/components/layout/Sidebar";
import CreateClusterModal from "@/components/modals/CreateClusterModal";
import { useUIStore } from "@/store/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop — closes sidebar when tapped */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-surface-DEFAULT min-w-0">
        {children}
      </main>
      <CreateClusterModal />
    </div>
  );
}
