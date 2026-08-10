import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Memory OS — Cognitive Data Workbench",
  description: "A private workspace for capturing, measuring, and questioning personal knowledge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col bg-[#E7E1D3] text-[#12233A]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
