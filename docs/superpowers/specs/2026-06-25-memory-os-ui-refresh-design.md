# Memory OS UI Refresh Design

## Goal

Refresh Memory OS into a premium, minimal, fashion-forward dark product interface without changing core behavior, data flow, routing, storage, or AI pipeline logic.

## Approved Direction

Use option A: restrained red-black flagship product feel.

The landing page uses `/Users/Check/Desktop/1e6c1925e52ee2cd926a18df18cee07e.jpg` as the core first-viewport visual. The red scanning-light image becomes the product signature, with black surfaces, crisp neutral typography, fine borders, and small red interaction accents across folders and workspace.

## Scope

- Landing page: full-bleed image-led title page with direct entry to `/folders`.
- Folders page: premium dark folder chooser with glass-like surfaces, refined actions, and matching red accents.
- Workspace shell: preserve the three-column grid while upgrading panel surfaces, dividers, headers, empty states, timeline cards, chat bubbles, and inputs.
- Global theme: update CSS variables and shared micro-animations for a cohesive dark interface.

## Non-Goals

- No storage changes.
- No AI/chat pipeline changes.
- No route changes.
- No folder isolation changes.
- No implementation of the relationship canvas.
- No light theme.

## Implementation Boundaries

Components stay in their current ownership areas. UI components may import existing hooks, stores, types, shared components, and animations as already established. No component will import storage adapters or services. Existing behaviors such as folder creation/deletion, upload tabs, memory selection, title rename, delete, chat optimistic updates, and message pagination remain intact.

## Verification

Run lint and production build after edits. Start the local dev server and verify that `/`, `/folders`, and `/workspace/[folderId]` render without compile errors.
