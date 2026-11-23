"use client";

import { Search, Sparkles, Zap } from "lucide-react";

export type SearchMode = "auto" | "on" | "off";

export default function DeepSearchToggle({
  value,
  onChange,
}: {
  value: SearchMode;
  onChange: (value: SearchMode) => void;
}) {
  return (
    <div className="deep-search-control flex shrink-0 items-center gap-2 rounded-full" role="group" aria-label="Web search mode">
      <span className="deep-search-label flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Web Search</span>
      </span>
      <div className="deep-search-segment flex items-center rounded-full p-0.5">
        <button
          type="button"
          aria-pressed={value === "auto"}
          onClick={() => onChange("auto")}
          className={"deep-search-option " + (value === "auto" ? "is-active" : "")}
        >
          <Zap className="h-3 w-3" aria-hidden="true" /> Auto
        </button>
        <button
          type="button"
          aria-pressed={value === "on"}
          onClick={() => onChange("on")}
          className={"deep-search-option " + (value === "on" ? "is-active" : "")}
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" /> Deep
        </button>
        <button
          type="button"
          aria-pressed={value === "off"}
          onClick={() => onChange("off")}
          className={"deep-search-option " + (value === "off" ? "is-active" : "")}
        >
          Off
        </button>
      </div>
    </div>
  );
}
