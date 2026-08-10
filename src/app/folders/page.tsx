"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { storage } from "@/storage";
import { useFolderStore } from "@/stores/folderStore";
import type { Folder } from "@/types";

const FOLDER_COLORS = [
  "#E7E1D3",
  "#12233A",
  "#E85327",
];

const CARD_THEMES = [
  {
    surface: "bg-[#12233A]",
    text: "text-[#E7E1D3]",
    meta: "text-[#E7E1D3]/58",
    signal: "bg-[#E85327]",
    action: "bg-[#E85327] text-[#12233A]",
    shadow: "shadow-[6px_6px_0_#E85327]",
  },
  {
    surface: "bg-[#E85327]",
    text: "text-[#12233A]",
    meta: "text-[#12233A]/62",
    signal: "bg-[#12233A]",
    action: "bg-[#E7E1D3] text-[#12233A]",
    shadow: "shadow-[6px_6px_0_#12233A]",
  },
  {
    surface: "bg-[#F2EDDF]",
    text: "text-[#12233A]",
    meta: "text-[#12233A]/56",
    signal: "bg-[#E85327]",
    action: "bg-[#12233A] text-[#E7E1D3]",
    shadow: "shadow-[6px_6px_0_#12233A]",
  },
];

function themeFor(folder: Folder, index: number) {
  const seed = [...folder.id].reduce((sum, char) => sum + char.charCodeAt(0), index);
  return CARD_THEMES[seed % CARD_THEMES.length];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

export default function FoldersPage() {
  const router = useRouter();
  const { folders, setFolders, addFolder, setActiveFolder } = useFolderStore();
  const [newName, setNewName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    storage.readAllFolders().then((f) => {
      setFolders(f);
      setIsLoading(false);
    });
  }, [setFolders]);

  const folderCountLabel = useMemo(
    () => `${folders.length} ${folders.length === 1 ? "space" : "spaces"}`,
    [folders.length]
  );

  const handleEnter = useCallback(
    (folder: Folder) => {
      if (editingFolderId) return;
      setActiveFolder(folder.id);
      storage.setCurrentFolder(folder.id);
      router.push(`/workspace/${folder.id}`);
    },
    [editingFolderId, router, setActiveFolder]
  );

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || isCreating) return;

    setIsCreating(true);
    const now = new Date().toISOString();
    const folder: Folder = {
      id: crypto.randomUUID(),
      name,
      color: FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)],
      created_at: now,
      updated_at: now,
    };

    await storage.saveFolder(folder);
    addFolder(folder);
    setNewName("");
    setIsCreating(false);
  }, [newName, addFolder, isCreating]);

  const startRename = useCallback((e: React.MouseEvent, folder: Folder) => {
    e.stopPropagation();
    setEditingFolderId(folder.id);
    setEditingName(folder.name);
  }, []);

  const saveRename = useCallback(async () => {
    const folderId = editingFolderId;
    const name = editingName.trim();
    if (!folderId) return;

    const folder = folders.find((f) => f.id === folderId);
    if (!folder) {
      setEditingFolderId(null);
      return;
    }

    if (!name || name === folder.name) {
      setEditingFolderId(null);
      setEditingName("");
      return;
    }

    const updated: Folder = {
      ...folder,
      name,
      updated_at: new Date().toISOString(),
    };
    await storage.saveFolder(updated);
    setFolders(folders.map((f) => (f.id === folderId ? updated : f)));
    setEditingFolderId(null);
    setEditingName("");
  }, [editingFolderId, editingName, folders, setFolders]);

  const cancelRename = useCallback(() => {
    setEditingFolderId(null);
    setEditingName("");
  }, []);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, folderId: string) => {
      e.stopPropagation();
      const confirmed = window.confirm("确定要删除此文件夹及其所有内容吗？");
      if (!confirmed) return;
      await storage.deleteFolder(folderId);
      setFolders(folders.filter((f) => f.id !== folderId));
    },
    [folders, setFolders]
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#E7E1D3] text-[#12233A]">
      <div className="mx-auto flex min-h-screen max-w-[1480px] flex-col px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
        <header className="surface-in flex items-center justify-between border-b border-[#12233A] pb-4 font-mono text-[10px] tracking-[0.15em]">
          <button
            onClick={() => router.push("/")}
            className="font-semibold text-[#12233A] transition-colors hover:text-[#E85327]"
          >
            MEMORY OS / INDEX
          </button>
          <span>
            {folderCountLabel.toUpperCase()}
          </span>
        </header>

        <section className="w-full flex-1 py-10 sm:py-14">
          <div className="surface-in mb-9 grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end">
            <div>
              <p className="font-mono text-[10px] tracking-[0.18em] text-[#E85327]">WORKSPACE LIBRARY / 001</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl">
                选择一个数据空间。
              </h1>
            </div>
            <p className="border-l border-[#12233A] pl-4 text-sm leading-6 text-[#12233A]/65">
              每个空间独立保存资料、质量指标和对话记录。名称只负责定位，不替你定义项目。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <section className="surface-in flex min-h-[230px] flex-col rounded-[6px] bg-[#12233A] p-5 text-[#E7E1D3] shadow-[6px_6px_0_#E85327]">
              <div className="flex items-start justify-between">
                <p className="font-mono text-[10px] tracking-[0.16em] text-[#E85327]">NEW SPACE</p>
                <span className="font-mono text-xl">＋</span>
              </div>
              <div className="mt-auto">
                <label htmlFor="new-folder-name" className="mb-2 block text-xs text-[#E7E1D3]/60">
                  文件夹名称
                </label>
                <input
                  id="new-folder-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  placeholder="例如：研究日志"
                  className="h-11 w-full rounded-[4px] bg-[#E7E1D3] px-3 text-sm text-[#12233A] outline-none placeholder:text-[#12233A]/42"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || isCreating}
                  className="mt-3 h-11 w-full rounded-[4px] bg-[#E85327] font-mono text-xs font-semibold tracking-[0.08em] text-[#12233A] transition-[transform,opacity] hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {isCreating ? "创建中..." : "CREATE SPACE ↗"}
                </button>
              </div>
            </section>

            {isLoading ? (
              <section className="flex min-h-[230px] items-center justify-center rounded-[6px] bg-[#D6D0C3] font-mono text-[10px] tracking-[0.14em] text-[#12233A]/55">
                LOADING SPACES...
              </section>
            ) : folders.length === 0 ? (
              <section className="flex min-h-[230px] items-end rounded-[6px] bg-[#E85327] p-5 text-sm leading-6 text-[#12233A] shadow-[6px_6px_0_#12233A]">
                先命名第一个空间。它会成为资料、指标和问答的共同边界。
              </section>
            ) : (
              folders.map((folder, index) => {
                const theme = themeFor(folder, index);
                const isEditing = editingFolderId === folder.id;

                return (
                  <article
                    key={folder.id}
                    onClick={() => handleEnter(folder)}
                    className={`surface-in group flex min-h-[230px] cursor-pointer flex-col rounded-[6px] p-5 transition-[transform,box-shadow] hover:-translate-y-1 ${theme.surface} ${theme.text} ${theme.shadow}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.15em]">
                        <span className={`h-2 w-2 ${theme.signal}`} />
                        SPACE {String(index + 1).padStart(2, "0")}
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, folder.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-[#E7E1D3] text-lg text-[#12233A] opacity-55 transition-opacity hover:opacity-100"
                        title="删除"
                        aria-label={`删除 ${folder.name}`}
                      >
                        ×
                      </button>
                    </div>

                    <div className="mt-10">
                      {isEditing ? (
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={saveRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename();
                            if (e.key === "Escape") cancelRename();
                          }}
                          autoFocus
                          className="w-full rounded-[4px] bg-[#E7E1D3] px-3 py-2 text-xl font-semibold text-[#12233A] outline-none"
                        />
                      ) : (
                        <button
                          onClick={(e) => startRename(e, folder)}
                          className={`block max-w-full text-left text-2xl font-semibold leading-tight tracking-[-0.025em] ${theme.text}`}
                          title="点击重命名"
                        >
                          <span className="line-clamp-3">{folder.name}</span>
                        </button>
                      )}
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-5 pt-8">
                      <div className={`font-mono text-[9px] leading-4 tracking-[0.12em] ${theme.meta}`}>
                        PRIVATE DATA<br />{formatDate(folder.updated_at)}
                      </div>
                      <span className={`flex h-9 w-9 items-center justify-center rounded-[4px] text-lg transition-transform group-hover:translate-x-1 ${theme.action}`}>
                        →
                      </span>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-[#12233A] pt-4 font-mono text-[9px] tracking-[0.14em] text-[#12233A]/62">
          <span>PRIVATE KNOWLEDGE SYSTEM</span>
          <span>LOCAL / TRACEABLE</span>
        </footer>
      </div>
    </main>
  );
}
