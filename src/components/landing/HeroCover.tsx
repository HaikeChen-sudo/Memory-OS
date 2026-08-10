"use client";

import Link from "next/link";
import Image from "next/image";

export function HeroCover() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#E7E1D3] text-[#12233A]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(340px,34vw)_1fr]">
        <figure className="relative min-h-[48vh] overflow-hidden lg:col-start-2 lg:row-start-1 lg:min-h-screen">
          <Image
            src="/memory-os-signal.jpg"
            alt="橙色笔触穿过人物肖像的抽象画"
            fill
            priority
            sizes="(min-width: 1024px) 66vw, 100vw"
            className="object-cover object-[56%_center]"
          />
          <figcaption className="absolute bottom-4 right-4 bg-[#E7E1D3] px-3 py-2 font-mono text-[9px] tracking-[0.16em] text-[#12233A]">
            VISUAL / SIGNAL 001
          </figcaption>
        </figure>

        <section className="relative flex min-h-[52vh] flex-col bg-[#12233A] px-6 py-6 text-[#E7E1D3] sm:px-10 lg:col-start-1 lg:row-start-1 lg:min-h-screen lg:px-12 lg:py-9">
          <header className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em]">
            <span>MEMORY OS</span>
            <span className="text-[#E85327]">V0.2</span>
          </header>

          <div className="absolute left-0 right-0 top-[29%] z-10 h-2 bg-[#E85327] lg:-right-8" />

          <div className="surface-in mt-auto pb-3 pt-20 lg:pb-8">
            <p className="font-mono text-[10px] tracking-[0.18em] text-[#E85327]">
              SOURCE / MODEL / TRACE / REVIEW
            </p>
            <h1 className="mt-5 max-w-md text-5xl font-semibold leading-[0.88] tracking-[-0.06em] sm:text-6xl lg:text-[clamp(3.5rem,5.7vw,6.6rem)]">
              Memory<br />OS
            </h1>
            <p className="mt-6 max-w-sm text-sm leading-6 text-[#E7E1D3]/72 sm:text-base">
              私人认知数据工作台。采集资料，测量知识结构，再用可追溯的 AI 对话检索它。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link
                href="/folders"
                className="group inline-flex h-12 items-center gap-8 rounded-[4px] bg-[#E85327] px-5 font-mono text-xs font-semibold tracking-[0.08em] text-[#12233A] shadow-[5px_5px_0_#E7E1D3] transition-[transform,box-shadow] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[2px_2px_0_#E7E1D3]"
              >
                ENTER WORKSPACE
                <span aria-hidden="true">↗</span>
              </Link>
              <span className="font-mono text-[9px] leading-4 tracking-[0.12em] text-[#E7E1D3]/48">
                PRIVATE DATA<br />LOCAL WORKSPACE
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
