import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace — Memory OS",
};

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
