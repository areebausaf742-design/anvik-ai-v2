"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUp,
  AudioLines,
  Code2,
  Eye,
  Image as ImageIcon,
  KeyRound,
  MessageSquareText,
  Settings2,
  Sparkles,
} from "lucide-react";
import Orb from "@/components/anvik/orb";
import TiltCard from "@/components/anvik/tilt-card";
import { Brand } from "@/components/anvik/navigation";

const SURFACES = [
  {
    href: "/chat",
    label: "Chat",
    title: "Live Gemini Streaming",
    text: "Sub-second token streaming in English, Hindi, or Hinglish with persistent sidebar history.",
    icon: MessageSquareText,
  },
  {
    href: "/image",
    label: "Image Studio",
    title: "Text-to-Image Art",
    text: "Pick Cinematic, Anime, 3D, Photoreal, or Cyberpunk and build a local gallery of 12 renders.",
    icon: ImageIcon,
  },
  {
    href: "/code",
    label: "Code Lab",
    title: "Write & Preview Code",
    text: "Generate Python, TypeScript, JS, HTML/CSS, or SQL with syntax colors and a live preview.",
    icon: Code2,
  },
  {
    href: "/voice",
    label: "Voice Mode",
    title: "Speak & Listen Aloud",
    text: "Dictate directly from your microphone, stream Gemini's reply, and play it back out loud.",
    icon: AudioLines,
  },
  {
    href: "/vision",
    label: "Vision Studio",
    title: "Analyze Any Image",
    text: "Upload screenshots, diagrams, or photos and ask Gemini questions about what is visible.",
    icon: Eye,
  },
  {
    href: "/settings",
    label: "Settings",
    title: "Your Own API Key",
    text: "Paste and test your Google AI Studio key, monitor daily quota, and manage local data.",
    icon: Settings2,
  },
];

const STARTERS = [
  "What is AI?",
  "Write Python code for calculator",
  "What is photosynthesis?",
  "What is a car?",
];

export default function Home() {
  const router = useRouter();
  const [quickPrompt, setQuickPrompt] = useState("");
  const [orbActive, setOrbActive] = useState(false);

  function launchQuickAsk(event: FormEvent) {
    event.preventDefault();
    const q = quickPrompt.trim();
    setOrbActive(true);
    if (q) {
      router.push(`/chat?prompt=${encodeURIComponent(q)}`);
    } else {
      router.push("/chat");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
      {/* Hero */}
      <section className="relative flex flex-col items-center text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-slate-300">
          <Sparkles className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
          <span>POWERED BY GEMINI · LIVE STREAMING</span>
        </div>

        <div className="my-2">
          <Orb size="large" active={orbActive} />
        </div>

        <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
          One Mind.{" "}
          <span className="gradient-text">Infinite Possibilities.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
          ANVIK AI brings live Gemini chat, image creation, runnable code, voice interaction, and
          visual analysis into one fast dark workspace powered by your own Google AI Studio key.
        </p>

        {/* Quick Ask Bar */}
        <form
          onSubmit={launchQuickAsk}
          className="glass-card mt-7 flex w-full max-w-2xl items-center gap-2 rounded-2xl p-2"
        >
          <input
            type="text"
            value={quickPrompt}
            onChange={(event) => setQuickPrompt(event.target.value)}
            placeholder="Ask ANVIK anything..."
            aria-label="Ask ANVIK anything"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            className="btn-gradient inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
          >
            <span>Ask Gemini</span>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {STARTERS.map((starter) => (
            <Link
              key={starter}
              href={`/chat?prompt=${encodeURIComponent(starter)}`}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition hover:border-[#22D3EE]/50 hover:bg-white/[0.08] hover:text-white"
            >
              {starter}
            </Link>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/chat"
            className="btn-gradient inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white"
          >
            Open Chat Workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            <KeyRound className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
            Add &amp; Test API Key
          </Link>
        </div>
      </section>

      {/* Six Working Surfaces */}
      <section className="mt-16 sm:mt-20">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#22D3EE]">
              Complete Studio
            </p>
            <h2 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
              Six connected AI workspaces
            </h2>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-slate-400 sm:text-sm">
            Every surface uses your saved Gemini API key directly with automatic Flash model fallback.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SURFACES.map(({ href, label, title, text, icon: Icon }) => (
            <TiltCard key={href} className="glass-card rounded-2xl">
              <Link href={href} className="flex h-full flex-col justify-between p-5">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {label}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-white">{title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400 sm:text-sm">
                    {text}
                  </p>
                </div>
              </Link>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-20 border-t border-white/10 pt-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <Brand />
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-400">
            <Link href="/chat" className="hover:text-white">Chat</Link>
            <Link href="/image" className="hover:text-white">Image</Link>
            <Link href="/code" className="hover:text-white">Code</Link>
            <Link href="/voice" className="hover:text-white">Voice</Link>
            <Link href="/vision" className="hover:text-white">Vision</Link>
            <Link href="/library" className="hover:text-white">Library</Link>
            <Link href="/settings" className="hover:text-white">Settings</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
