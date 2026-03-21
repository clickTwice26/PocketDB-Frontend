"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AccentTheme = "indigo" | "violet" | "sky" | "emerald" | "amber" | "rose";

interface UIStore {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  createModalOpen: boolean;
  setCreateModalOpen: (v: boolean) => void;
  selectedClusterId: string | null;
  setSelectedClusterId: (id: string | null) => void;
  accent: AccentTheme;
  setAccent: (accent: AccentTheme) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      createModalOpen: false,
      setCreateModalOpen: (v) => set({ createModalOpen: v }),
      selectedClusterId: null,
      setSelectedClusterId: (id) => set({ selectedClusterId: id }),
      accent: "indigo",
      setAccent: (accent) => set({ accent }),
    }),
    {
      name: "pocketdb-ui",
      partialize: (state) => ({ accent: state.accent, sidebarOpen: state.sidebarOpen }),
    }
  )
);
