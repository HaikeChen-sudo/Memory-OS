# Memory OS UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved restrained red-black premium UI refresh while preserving Memory OS behavior.

**Architecture:** This is a presentation-layer change. Existing routes, stores, hooks, storage proxy, API routes, and feature modules remain unchanged. The image asset is copied into `memory-os/public` so Next.js can serve it through a stable public path.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, existing CSS variables and component structure.

---

### Task 1: Public Asset And Global Theme

**Files:**
- Create: `memory-os/public/hero-memory-os.jpg`
- Modify: `memory-os/src/app/globals.css`

- [ ] Copy `/Users/Check/Desktop/1e6c1925e52ee2cd926a18df18cee07e.jpg` to `memory-os/public/hero-memory-os.jpg`.
- [ ] Update CSS variables to black, graphite, red, amber, and blue-neutral accents.
- [ ] Add subtle reusable keyframes for hero scan, surface reveal, and active glow.
- [ ] Keep dark mode only and preserve Tailwind import/theme mapping.

### Task 2: Landing And Folder Surfaces

**Files:**
- Modify: `memory-os/src/components/landing/HeroCover.tsx`
- Modify: `memory-os/src/app/folders/page.tsx`

- [ ] Rebuild the landing hero around the public hero image.
- [ ] Keep `/folders` as the Enter destination.
- [ ] Restyle the folder chooser while preserving load/create/delete/enter behavior.
- [ ] Avoid new routes and avoid changing storage calls already present in the page.

### Task 3: Workspace Shell And Panels

**Files:**
- Modify: `memory-os/src/app/workspace/[folderId]/page.tsx`
- Modify: `memory-os/src/components/workspace/left/LeftPanel.tsx`
- Modify: `memory-os/src/components/workspace/left/UploadZone.tsx`
- Modify: `memory-os/src/components/workspace/left/Timeline.tsx`
- Modify: `memory-os/src/components/workspace/left/MemoryCard.tsx`
- Modify: `memory-os/src/components/workspace/middle/MiddlePanel.tsx`
- Modify: `memory-os/src/components/workspace/middle/MemoryDetail.tsx`
- Modify: `memory-os/src/components/workspace/right/ChatPanel.tsx`
- Modify: `memory-os/src/components/workspace/right/ChatMessage.tsx`
- Modify: `memory-os/src/components/workspace/right/ChatInput.tsx`
- Modify: `memory-os/src/components/shared/TimeBadge.tsx`
- Modify: `memory-os/src/components/shared/TypeIcon.tsx`

- [ ] Preserve the three-column grid widths from `uiStore`.
- [ ] Upgrade panel backgrounds, borders, headers, empty states, cards, and controls.
- [ ] Keep all existing event handlers and data dependencies.
- [ ] Use text/icon changes only where they do not alter behavior.

### Task 4: Verification

**Files:**
- No production file changes.

- [ ] Run `npm run lint` in `memory-os`.
- [ ] Run `npm run build` in `memory-os`.
- [ ] Start `npm run dev` and provide the local URL.
- [ ] If verification fails, fix the reported issue and rerun the relevant command.
