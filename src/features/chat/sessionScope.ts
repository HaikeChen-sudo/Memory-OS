import type { Session } from "@/types";

/** Returns a session only when its persisted folder identity matches the route. */
export function sessionIdForFolder(session: Session | null | undefined, folderId: string | null): string | null {
  return session && folderId && session.folder_id === folderId ? session.id : null;
}
