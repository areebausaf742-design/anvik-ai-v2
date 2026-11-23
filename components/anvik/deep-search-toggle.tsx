"use client";

import { Search, Sparkles } from "lucide-react";

export default function DeepSearchToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <div className="deep-search-control flex shrink-0 items-center gap-2 rounded-full" role="group" aria-label="Deep Search">
      <span className="deep-search-label flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Deep Search</span>
      </span>
      <div className="deep-search-segment flex items-center rounded-full p-0.5">
        <button type="button" aria-pressed={enabled} onClick={() => onChange(true)} className={"deep-search-option " + (enabled ? "is-active" : "")}>
          <Sparkles className="h-3 w-3" aria-hidden="true" /> On
        </button>
        <button type="button" aria-pressed={!enabled} onClick={() => onChange(false)} className={"deep-search-option " + (!enabled ? "is-active" : "")}>Off</button>
      </div>
    </div>
  );
}
