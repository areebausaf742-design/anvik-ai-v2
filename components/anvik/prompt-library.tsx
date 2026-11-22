import Link from "next/link";
import { ArrowUpRight, Lightbulb, Sparkles } from "lucide-react";
import TiltCard from "@/components/anvik/tilt-card";
import { promptLibrary } from "@/lib/prompts";

export default function PromptLibrary() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#D97757]">
          <Sparkles className="h-3.5 w-3.5" /> Prompt Library
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1A1A1A] sm:text-4xl">
          Start from a prompt{" "}
          <span>built for real work.</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[#666666]">
          Pick a prompt to open it in ANVIK Chat and shape it around your workflow.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {promptLibrary.map((prompt, index) => (
          <TiltCard key={prompt} className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm">
            <Link
              href={`/chat?prompt=${encodeURIComponent(prompt)}`}
              className="flex h-full flex-col justify-between p-5"
            >
              <div>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#D97757]">
                  {String(index + 1).padStart(2, "0")}
                  <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <p className="mt-2.5 text-sm leading-relaxed text-[#1A1A1A]">{prompt}</p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1A1A1A]">
                Ask in Chat <ArrowUpRight className="h-3.5 w-3.5 text-[#D97757]" aria-hidden="true" />
              </span>
            </Link>
          </TiltCard>
        ))}
      </div>
    </main>
  );
}
