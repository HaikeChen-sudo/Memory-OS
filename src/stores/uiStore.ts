import { create } from "zustand";

interface UIState {
  leftColumnWidth: number;
  middleColumnWidth: number;
  rightColumnWidth: number;
}

export const useUIStore = create<UIState>(() => ({
  leftColumnWidth: 30,
  middleColumnWidth: 35,
  rightColumnWidth: 35,
}));
