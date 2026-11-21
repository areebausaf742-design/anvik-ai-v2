import Link from "next/link";
import { ArrowUpRight, Lightbulb, Sparkles } from "lucide-react";
import TiltCard from "@/components/anvik/tilt-card";
import { promptLibrary } from "@/lib/prompts";

export default function PromptLibrary() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#22D3EE]">
          <Sparkles className="h-3.5 w-3.5" /> Prompt Library
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Start from a prompt{" "}
          <span className="gradient-text">built for real work.</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Pick any prompt to open it directly in live Gemini Chat and customize it to your workflow.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {promptLibrary.map((prompt, index) => (
          <TiltCard key={prompt} className="glass-card rounded-2xl">
            <Link
              href={`/chat?prompt=${encodeURIComponent(prompt)}`}
              className="flex h-full flex-col justify-between p-5"
            >
              <div>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#22D3EE]">
                  {String(index + 1).padStart(2, "0")}
                  <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-100">{prompt}</p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-white">
                Ask in Chat <ArrowUpRight className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
              </span>
            </Link>
          </TiltCard>
        ))}
      </div>
    </main>
  );
}
