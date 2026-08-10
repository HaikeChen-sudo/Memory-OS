"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { LeftPanel } from "@/components/workspace/left/LeftPanel";
import { MiddlePanel } from "@/components/workspace/middle/MiddlePanel";
import { ChatPanel } from "@/components/workspace/right/ChatPanel";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { useUIStore } from "@/stores/uiStore";
import { useFolderStore } from "@/stores/folderStore";
import { storage } from "@/storage";

export default function WorkspacePage() {
  const { leftColumnWidth, middleColumnWidth, rightColumnWidth } = useUIStore();
  const params = useParams<{ folderId: string }>();
  const router = useRouter();
  const setActiveFolder = useFolderStore((s) => s.setActiveFolder);

  useEffect(() => {
    const folderId = params?.folderId;
    if (!folderId) {
      router.replace("/folders");
      return;
    }
    setActiveFolder(folderId);
    storage.setCurrentFolder(folderId);
  }, [params, router, setActiveFolder]);

  return (
    <div className="h-screen overflow-x-auto overflow-y-hidden bg-[#12233A] text-[#12233A]">
      <div
        className="relative grid h-full min-w-[740px] gap-px overflow-hidden bg-[#12233A]"
        style={{
          display: "grid",
          gridTemplateColumns: `minmax(220px, ${leftColumnWidth}%) minmax(260px, ${middleColumnWidth}%) minmax(260px, ${rightColumnWidth}%)`,
        }}
      >
        {/* Left column — Data & Timeline */}
        <div className="relative h-full overflow-hidden bg-[#E7E1D3]">
          <ErrorBoundary>
            <LeftPanel />
          </ErrorBoundary>
        </div>

        {/* Middle column — Relationships */}
        <div className="relative h-full overflow-hidden bg-[#D6D0C3]">
          <ErrorBoundary>
            <MiddlePanel />
          </ErrorBoundary>
        </div>

        {/* Right column — AI Chat */}
        <div className="relative h-full overflow-hidden bg-[#12233A] text-[#E7E1D3]">
          <ErrorBoundary>
            <ChatPanel />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
