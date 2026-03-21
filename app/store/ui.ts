"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "diu";

interface UIStore {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  createModalOpen: boolean;
  setCreateModalOpen: (v: boolean) => void;
  selectedClusterId: string | null;
  setSelectedClusterId: (id: string | null) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
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
      theme: "dark",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "pocketdb-ui",
      partialize: (state) => ({
        theme:       state.theme,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
