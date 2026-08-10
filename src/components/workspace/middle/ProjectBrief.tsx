"use client";

import { useState } from "react";
import { useProjectBrief } from "@/hooks/useProjectBrief";
import type { BriefEvidence } from "@/types/projectBrief";
import { KnowledgeObservatory } from "./KnowledgeObservatory";

/** Shows a source-linked operational summary when no memory is selected. */
export function ProjectBrief() {
  const [view, setView] = useState<"data" | "brief">("data");

  return (
    <div className="flex h-full flex-col bg-[#D6D0C3] text-[#12233A]">
      <header className="flex-shrink-0 border-b border-[#12233A]/24 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] tracking-[0.2em] text-[#E85327]">02 / MEMORY OS LAB</p>
            <h2 className="mt-1 text-lg font-semibold">认知数据观测台</h2>
          </div>
          <nav className="flex rounded-[3px] bg-[#12233A] p-0.5 font-mono text-[9px] tracking-[0.12em]" aria-label="中列视图">
            <ViewButton active={view === "data"} onClick={() => setView("data")}>DATA</ViewButton>
            <ViewButton active={view === "brief"} onClick={() => setView("brief")}>OPS</ViewButton>
          </nav>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        {view === "data" ? <KnowledgeObservatory /> : <OperatingBrief />}
      </div>
    </div>
  );
}

function OperatingBrief() {
  const { brief, isLoading, isError } = useProjectBrief();

  if (isLoading) return <ProjectBriefLoading />;
  if (isError) return <ProjectBriefError />;

  return (
      <div className="space-y-6 p-4">
        <p className="border-l-2 border-[#E85327] pl-3 text-xs leading-5 text-[#12233A]/62">{brief.summary}</p>
        <Section title="当前焦点">
          {brief.focusAreas.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {brief.focusAreas.map((area) => (
                <span key={area} className="rounded-[3px] bg-[#E7E1D3] px-2.5 py-1 text-xs text-[#12233A]">
                  {area}
                </span>
              ))}
            </div>
          ) : <EmptyText text="上传带标题或关键词的资料后，这里会归纳团队正在推进的主题。" />}
        </Section>

        <Section title="待推进">
          {brief.actions.length > 0 ? (
            <ul className="space-y-3">
              {brief.actions.map((action) => (
                <li key={action.evidence.memoryId} className="rounded-[4px] bg-[#E7E1D3] p-3">
                  <p className="text-sm font-medium text-[#12233A]">{action.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#12233A]/58">{action.reason}</p>
                  <Evidence evidence={action.evidence} />
                </li>
              ))}
            </ul>
          ) : <EmptyText text="在资料中写下“待办”“下一步”或“跟进”，系统会把它们汇总到这里。" />}
        </Section>

        <Section title="需要处理">
          {brief.risks.length > 0 ? (
            <ul className="space-y-3">
              {brief.risks.map((risk) => (
                <li key={risk.evidence.memoryId} className="rounded-[4px] bg-[#E85327] p-3 text-[#12233A]">
                  <p className="text-sm font-medium">{risk.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#12233A]/65">{risk.detail}</p>
                  <Evidence evidence={risk.evidence} />
                </li>
              ))}
            </ul>
          ) : <EmptyText text="还没有识别到风险或待确认事项。" />}
        </Section>
      </div>
  );
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-[2px] px-2.5 py-1.5 transition-colors ${active ? "bg-[#E85327] text-[#12233A]" : "text-[#E7E1D3]/55 hover:text-[#E7E1D3]"}`}>{children}</button>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-2 font-mono text-[9px] font-medium uppercase tracking-[0.15em] text-[#E85327]">{title}</h3>{children}</section>;
}

function Evidence({ evidence }: { evidence: BriefEvidence }) {
  return <p className="mt-2 truncate font-mono text-[9px] text-[#12233A]/55">证据：{evidence.title}</p>;
}

function EmptyText({ text }: { text: string }) {
  return <p className="border-l border-[#12233A]/35 px-3 py-2 text-xs leading-5 text-[#12233A]/52">{text}</p>;
}

function ProjectBriefLoading() {
  return <div className="flex h-full items-center justify-center font-mono text-[10px] tracking-[0.12em] text-[#12233A]/52">正在读取项目资料…</div>;
}

function ProjectBriefError() {
  return <div className="flex h-full items-center justify-center px-8 text-center text-sm leading-6 text-[#12233A]/52">项目脉搏暂时无法读取资料。请稍后重试。</div>;
}
