interface TimeBadgeProps {
  label: string;
  count: number;
  className?: string;
}

export function TimeBadge({ label, count, className = "" }: TimeBadgeProps) {
  return (
    <div
      className={`mb-1 flex items-center justify-between border-b border-[#12233A]/18 px-3 py-2 font-mono text-[9px] tracking-[0.1em] text-[#12233A]/60 ${className}`}
    >
      <span>{label}</span>
      <span className="bg-[#12233A] px-1.5 py-0.5 text-[8px] text-[#E7E1D3]">
        {count}
      </span>
    </div>
  );
}
