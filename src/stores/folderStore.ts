import { create } from "zustand";
import type { Folder } from "@/types";

interface FolderState {
  folders: Folder[];
  activeFolderId: string | null;

  setFolders: (folders: Folder[]) => void;
  addFolder: (folder: Folder) => void;
  setActiveFolder: (id: string | null) => void;
}

export const useFolderStore = create<FolderState>((set) => ({
  folders: [],
  activeFolderId: null,

  setFolders: (folders) => set({ folders }),
  addFolder: (folder) =>
    set((state) => ({ folders: [...state.folders, folder] })),
  setActiveFolder: (id) => set({ activeFolderId: id }),
}));
