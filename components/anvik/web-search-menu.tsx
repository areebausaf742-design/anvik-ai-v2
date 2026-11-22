"use client";

import { useEffect, useRef, useState } from "react";
import { SearchX, Sparkles, Check, Globe } from "lucide-react";
import type { SearchMode } from "@/lib/search";

const OPTIONS: {
  mode: SearchMode;
  label: string;
  hint: string;
  icon: typeof Sparkles;
}[] = [
  { mode: "auto", label: "Auto", hint: "ANVIK decides when the web is needed", icon: Sparkles },
  { mode: "on", label: "On", hint: "Always search the web for the answer", icon: Globe },
  { mode: "off", label: "Off", hint: "Never search — answer from knowledge only", icon: SearchX },
];

/**
 * The Web Search toggle in the chat composer. Three modes — Auto / On / Off —
 * in a small popover attached to the chatbar. The user always controls the
 * decision: Auto is the intelligent default, On always searches, Off never
 * leaves the model's knowledge.
 */
export default function WebSearchMenu({
  mode,
  onChange,
}: {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = OPTIONS.find((item) => item.mode === mode) ?? OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Web Search — ${current.label}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`websearch-btn ${mode !== "off" ? "websearch-btn-live" : ""}`}
        title={`Web Search: ${current.label}`}
      >
        <CurrentIcon className="h-4 w-4" />
        <span className="websearch-btn-label">{current.label}</span>
        <span className={`websearch-dot ${mode === "on" ? "websearch-dot-on" : mode === "auto" ? "websearch-dot-auto" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Web Search mode"
          className="absolute bottom-[calc(100%+10px)] left-0 z-30 w-72 rounded-2xl border border-[#E5E5E5] bg-white p-2 shadow-xl"
        >
          <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-widest text-[#999999]">
            Web Search
          </p>
          {OPTIONS.map((option) => {
            const active = option.mode === mode;
            const OptionIcon = option.icon;
            return (
              <button
                key={option.mode}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(option.mode);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-[#F7F7F5]" : "hover:bg-[#F7F7F5]"
                }`}
              >
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  active ? "bg-[#1A1A1A] text-white" : "border border-[#EDEDED] text-[#666666]"
                }`}>
                  <OptionIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[#1A1A1A]">{option.label}</span>
                  <span className="block text-xs leading-snug text-[#666666]">{option.hint}</span>
                </span>
                {active && <Check className="mt-1 h-4 w-4 shrink-0 text-[#1A1A1A]" aria-hidden="true" />}
              </button>
            );
          })}
          <p className="px-3 pb-1 pt-1.5 text-[11px] leading-relaxed text-[#999999]">
            Auto searches the web only when a question needs up-to-date information.
          </p>
        </div>
      )}
    </div>
  );
}
