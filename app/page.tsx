"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Code2, FileText, Image as ImageIcon, Lightbulb, Mic, AudioLines } from "lucide-react";
import AnvikStar from "@/components/anvik/anvik-star";
import { readMemory } from "@/lib/learning";
import { useEffect } from "react";

const WELCOME_CARDS = [
  { title: "Explain photosynthesis in Hindi", desc: "Simple language with real examples from daily life", icon: Lightbulb },
  { title: "Write calculator code", desc: "Clean, working code you can run right away", icon: Code2 },
  { title: "Make a study plan", desc: "A 30-day roadmap tailored to your goals", icon: FileText },
];

const SUGGESTION_CHIPS = [
  "Photosynthesis kya hai?",
  "Calculator ka code likho",
  "What is car?",
];

export default function Home() {
  const router = useRouter();
  const [quickPrompt, setQuickPrompt] = useState("");
  const [userName, setUserName] = useState("");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const mem = readMemory();
    setUserName(mem.name.trim());
  }, []);

  useEffect(() => {
    const full = userName ? `Welcome, ${userName}` : "Welcome";
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setTyped(full.slice(0, i));
      if (i >= full.length) clearInterval(timer);
    }, 80);
    return () => clearInterval(timer);
  }, [userName]);

  function launchQuickAsk(event: FormEvent) {
    event.preventDefault();
    const q = quickPrompt.trim();
    if (q) {
      router.push(`/chat?prompt=${encodeURIComponent(q)}`);
    } else {
      router.push("/chat");
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center bg-white px-4 pt-16 pb-12">
      <div className="mb-3 text-xs text-[#999999]">
        Free plan · <a href="/pricing" className="text-[#666666] hover:text-[#1A1A1A] underline">Upgrade</a>
      </div>

      <AnvikStar size="lg" className="mb-5" />

      <h1
        className="font-serif text-[32px] font-normal leading-tight text-[#1A1A1A]"
        style={{ letterSpacing: "-0.5px" }}
      >
        {typed}
        <span className="stream-cursor" />
      </h1>

      <form onSubmit={launchQuickAsk} className="mt-7 w-full max-w-[720px]">
        <div className="premium-input input-pulse p-2.5">
          <textarea
            value={quickPrompt}
            onChange={(event) => setQuickPrompt(event.target.value)}
            placeholder="How can I help you today?"
            aria-label="Ask ANVIK anything"
            rows={1}
            className="max-h-36 min-h-[44px] w-full resize-none bg-transparent px-2 py-1.5 text-[15px] text-[#1A1A1A] placeholder:text-[#999999] focus:outline-none"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Add attachment"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#EDEDED] text-[#666666] hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors"
              >
                <span className="text-lg leading-none">+</span>
              </button>
              <button
                type="button"
                aria-label="Voice input"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#EDEDED] text-[#666666] hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Audio"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#EDEDED] text-[#666666] hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors"
              >
                <AudioLines className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#999999]">ANVIK 1.0</span>
              <span className="text-xs font-medium text-[#999999]">Medium</span>
              <button
                type="submit"
                aria-label="Send"
                disabled={!quickPrompt.trim()}
                className="send-btn"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="premium-chip"
            onClick={() => router.push(`/chat?prompt=${encodeURIComponent(chip)}`)}
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="mt-12 grid w-full max-w-[720px] grid-cols-1 gap-3 sm:grid-cols-3">
        {WELCOME_CARDS.map((card) => (
          <button
            key={card.title}
            type="button"
            className="surface-card group p-5 text-left"
            onClick={() => router.push(`/chat?prompt=${encodeURIComponent(card.title)}`)}
          >
            <div className="flex items-start justify-between">
              <card.icon className="h-5 w-5 text-[#D97757]" />
              <ArrowUp className="h-4 w-4 -rotate-45 text-[#CCCCCC] transition-all group-hover:text-[#1A1A1A] group-hover:translate-x-0.5" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-[#1A1A1A]">{card.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-[#666666]">{card.desc}</p>
          </button>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
        <a href="/chat" className="quick-pill"><ImageIcon className="h-3.5 w-3.5 text-[#666666]" />Chat</a>
        <a href="/image" className="quick-pill"><ImageIcon className="h-3.5 w-3.5 text-[#666666]" />Image</a>
        <a href="/code" className="quick-pill"><Code2 className="h-3.5 w-3.5 text-[#666666]" />Code</a>
        <a href="/vision" className="quick-pill"><Lightbulb className="h-3.5 w-3.5 text-[#666666]" />Vision</a>
      </div>
    </main>
  );
}
