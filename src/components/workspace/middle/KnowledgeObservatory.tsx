"use client";

import { useKnowledgeObservatory } from "@/hooks/useKnowledgeObservatory";
import type { ActivityPoint, MetricScore } from "@/types/observatory";

/** Renders interpretable dataset statistics for the active knowledge workspace. */
export function KnowledgeObservatory() {
  const { profile, isLoading, isError } = useKnowledgeObservatory();

  if (isLoading) return <StateText text="正在扫描数据集…" />;
  if (isError) return <StateText text="数据集读取失败。" />;

  return (
    <div className="space-y-6 p-4 font-mono text-[#12233A]">
      <section className="grid grid-cols-[1.15fr_1fr] overflow-hidden rounded-[4px] bg-[#E7E1D3] shadow-[4px_4px_0_#12233A]">
        <div className="border-r border-[#12233A]/22 p-4">
          <p className="text-[9px] tracking-[0.2em] text-[#E85327]">COMPOSITE / Q</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-4xl font-light leading-none text-[#12233A]">{profile.quality.value}</span>
            <span className="pb-1 text-[10px] text-[#12233A]/48">/ 100</span>
          </div>
          <p className="mt-3 text-[10px] leading-4 text-[#12233A]/48" title={profile.quality.method}>n={profile.sampleSize} · pairs={profile.pairCount}</p>
        </div>
        <div className="grid grid-cols-2">
          <MetricCell metric={profile.completeness} code="CMP" />
          <MetricCell metric={profile.freshness} code="FRS" />
          <MetricCell metric={profile.diversity} code="ENT" />
          <MetricCell metric={profile.uniqueness} code="UNQ" />
        </div>
      </section>

      <section>
        <InstrumentLabel label="14 DAY ACTIVITY SIGNAL" value={`β₁ ${signed(profile.activitySlope)}`} />
        <ActivitySignal points={profile.activity} />
      </section>

      <section>
        <InstrumentLabel label="MODALITY DISTRIBUTION" value={`H ${profile.shannonEntropy} · HHI ${profile.concentrationHhi}`} />
        <div className="mt-2 border-t border-[#12233A]/30">
          {profile.modalities.length > 0 ? profile.modalities.map((modality) => (
            <div key={modality.type} className="grid grid-cols-[82px_1fr_42px] items-center gap-3 border-b border-[#12233A]/12 py-2 text-[10px]">
              <span className="truncate text-[#12233A]/62">{modality.type}</span>
              <span className="h-px bg-[#12233A]/18"><span className={`block h-px bg-[#E85327] ${widthClass(modality.share)}`} /></span>
              <span className="text-right text-[#12233A]/52">{Math.round(modality.share * 100)}%</span>
            </div>
          )) : <p className="py-4 text-[10px] text-[#12233A]/38">NO OBSERVATIONS</p>}
        </div>
      </section>

      <section>
        <InstrumentLabel label="DIAGNOSTICS" value={`${profile.warnings.length} FLAGS`} />
        <div className="mt-2 space-y-px">
          {profile.warnings.length > 0 ? profile.warnings.map((warning) => (
            <div key={warning.code} className="border-l-2 border-[#E85327] bg-[#E7E1D3] px-3 py-2.5">
              <p className="text-[9px] tracking-[0.12em] text-[#E85327]">{warning.code}</p>
              <p className="mt-1 font-sans text-xs leading-5 text-[#12233A]/62">{warning.message}</p>
            </div>
          )) : <p className="border-l-2 border-[#12233A] bg-[#E7E1D3] px-3 py-3 text-[10px] text-[#12233A]/58">NO QUALITY FLAGS</p>}
        </div>
      </section>

      {profile.duplicateCandidates.length > 0 && (
        <section>
          <InstrumentLabel label="NEAR-DUPLICATE PAIRS" value={`TOP ${Math.min(3, profile.duplicateCandidates.length)}`} />
          <ol className="mt-2 space-y-2">
            {profile.duplicateCandidates.slice(0, 3).map((candidate) => (
              <li key={`${candidate.leftMemoryId}:${candidate.rightMemoryId}`} className="border-b border-[#12233A]/14 pb-2 text-[10px] leading-4 text-[#12233A]/55">
                <span className="text-[#E85327]">J={candidate.similarity.toFixed(3)}</span> {candidate.leftTitle} ↔ {candidate.rightTitle}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function MetricCell({ metric, code }: { metric: MetricScore; code: string }) {
  return (
    <div className="border-b border-r border-[#12233A]/12 p-2.5" title={metric.method}>
      <p className="text-[8px] tracking-[0.16em] text-[#E85327]">{code}</p>
      <p className="mt-1 text-sm text-[#12233A]">{metric.value}</p>
    </div>
  );
}

function ActivitySignal({ points }: { points: ActivityPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.count));
  return (
    <div className="mt-2 flex h-20 items-end gap-[3px] border-b border-l border-[#12233A]/35 px-2 pt-2" aria-label="过去 14 天资料活动">
      {points.map((point) => (
        <span key={point.date} className="group relative flex h-full flex-1 items-end">
          <span className={`block w-full min-w-[2px] bg-[#E85327] transition-colors group-hover:bg-[#12233A] ${heightClass(point.count / max)}`} />
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap bg-[#12233A] px-1.5 py-1 text-[8px] text-[#E7E1D3] group-hover:block">{point.date} · {point.count}</span>
        </span>
      ))}
    </div>
  );
}

function InstrumentLabel({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-[9px] tracking-[0.15em]"><h3 className="text-[#E85327]">{label}</h3><span className="text-[#12233A]/45">{value}</span></div>;
}

function StateText({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center font-mono text-[10px] tracking-[0.16em] text-[#12233A]/45">{text}</div>;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function widthClass(value: number): string {
  const bucket = Math.ceil(value * 10);
  return ["w-0", "w-[10%]", "w-[20%]", "w-[30%]", "w-[40%]", "w-1/2", "w-[60%]", "w-[70%]", "w-4/5", "w-[90%]", "w-full"][bucket] ?? "w-0";
}

function heightClass(value: number): string {
  if (value <= 0) return "h-0";
  const bucket = Math.max(1, Math.ceil(value * 10));
  return ["h-[3%]", "h-[10%]", "h-[20%]", "h-[30%]", "h-[40%]", "h-1/2", "h-[60%]", "h-[70%]", "h-4/5", "h-[90%]", "h-full"][bucket] ?? "h-[3%]";
}
