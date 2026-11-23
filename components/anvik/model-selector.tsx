"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { modes, type ModeId } from "@/lib/prompts";

const descriptions: Record<ModeId, string> = {
  fast: "Clear answers with less waiting",
  smart: "More depth for complex questions",
  creative: "Explore original ideas and angles",
  coder: "Focused help for code and logic",
};

export default function ModelSelector({ value, onChange }: { value: ModeId; onChange: (mode: ModeId) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, modes.findIndex((item) => item.id === value));
  const selected = modes[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    const frame = window.requestAnimationFrame(() => itemsRef.current[selectedIndex]?.focus());
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.cancelAnimationFrame(frame);
    };
  }, [open, selectedIndex]);

  function choose(mode: ModeId) {
    onChange(mode);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = modes.findIndex((item) => item.id === value);
    let next = current;
    if (event.key === "ArrowDown") next = (current + 1) % modes.length;
    else if (event.key === "ArrowUp") next = (current - 1 + modes.length) % modes.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = modes.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    } else return;
    event.preventDefault();
    itemsRef.current[next]?.focus();
  }

  return (
    <div ref={wrapRef} className="model-selector relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={"Response style: " + selected.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            if (!open) { event.preventDefault(); setOpen(true); }
          }
        }}
        className="model-selector-trigger"
      >
        <span>{selected.label}</span>
        <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-180" : "")} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Choose response style" onKeyDown={handleMenuKeyDown} className="model-selector-menu absolute bottom-[calc(100%+10px)] right-0 z-50 w-72 rounded-2xl p-2 shadow-2xl">
          <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8b8f99]">Response style</p>
          {modes.map((item, index) => {
            const active = item.id === value;
            return (
              <button
                ref={(node) => { itemsRef.current[index] = node; }}
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => choose(item.id)}
                className={"model-selector-item flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors " + (active ? "is-selected" : "")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed">{descriptions[item.id]}</span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
