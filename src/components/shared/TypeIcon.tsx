import type { MemoryType } from "@/types";

const iconMap: Record<MemoryType, string> = {
  image: "IM",
  pdf: "PF",
  text: "TX",
  video_link: "VD",
  audio_link: "AU",
  web_link: "WB",
  note: "NT",
};

interface TypeIconProps {
  type: MemoryType;
  className?: string;
}

export function TypeIcon({ type, className = "" }: TypeIconProps) {
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-[3px] bg-[#E85327] font-mono text-[8px] font-semibold text-[#12233A] ${className}`}
      aria-label={type}
    >
      {iconMap[type] || "FI"}
    </span>
  );
}
