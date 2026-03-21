"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "diu";

interface UIStore {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  createModalOpen: boolean;
  setCreateModalOpen: (v: boolean) => void;
  selectedClusterId: string | null;
  setSelectedClusterId: (id: string | null) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  zenMode: boolean;
  setZenMode: (v: boolean) => void;
  toggleZenMode: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      mobileNavOpen: false,
      setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
      createModalOpen: false,
      setCreateModalOpen: (v) => set({ createModalOpen: v }),
      selectedClusterId: null,
      setSelectedClusterId: (id) => set({ selectedClusterId: id }),
      theme: "dark",
      setTheme: (theme) => set({ theme }),
      zenMode: false,
      setZenMode: (v) => set({ zenMode: v }),
      toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode })),
    }),
    {
      name: "pocketdb-ui",
      partialize: (state) => ({
        theme:             state.theme,
        sidebarOpen:       state.sidebarOpen,
        selectedClusterId: state.selectedClusterId,
      }),
    }
  )
);
