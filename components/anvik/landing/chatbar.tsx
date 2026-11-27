"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { readDeviceId } from "@/lib/client-key";

/**
 * Public landing-page chat bar. Fully interactive to type in; pressing send
 * (or Enter) stashes the draft and destination in sessionStorage and hands off
 * to /login, which restores the draft after sign-in and sends it from /chat.
 *
 * A soft band of light travels continuously around the bar's border — a
 * rotating conic gradient revealed through a border mask (@property),
 * GPU-composited, ~6s per loop. Reduced-motion users see a static elegant
 * border. The light brightens on hover, glows steadily on focus, and calms
 * while the user types.
 */

const SUGGESTIONS = [
  "Explain quantum computing like I'm twelve",
  "Write a Python script that renames my files",
  "Plan my mid-term study schedule",
  "Describe a futuristic city at golden hour",
  "Summarize this research paper's key findings",
];

export function PublicChatbar({ onSend }: { onSend: (draft: string) => void }) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // Living placeholder: types in, holds, dissolves into the next suggestion.
  // Pauses on focus and while typing.
  const cycle = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setSuggestionIndex((i) => (i + 1) % SUGGESTIONS.length);
    }, 3200);
  }, [clearTimer]);

  useEffect(() => {
    cycle();
    return clearTimer;
  }, [cycle]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content) return;
    sessionStorage.setItem("anvik-pending-draft", content);
    sessionStorage.setItem("anvik-pending-destination", "/chat");
    onSend(content);
  };

  const keySubmit = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit(event as unknown as FormEvent<HTMLFormElement>);
    }
  };

  const onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    typingRef.current = true;
    clearTimer();
    setInput(event.target.value);
    const field = fieldRef.current;
    if (field) {
      field.style.height = "auto";
      field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
    }
  };

  const onFocus = () => { setFocused(true); typingRef.current = false; clearTimer(); cycle(); };
  const onBlur = () => { setFocused(false); cycle(); };

  const canSend = Boolean(input.trim());

  return (
    <form onSubmit={submit} className="public-chatbar relative">
      {/* Roaming light band — border mask via @property conic gradient. */}
      <span className="public-chatbar-glow" aria-hidden="true" />
      <div className="public-chatbar-inner relative z-10">
        <div className="public-chatbar-row flex items-center gap-3 w-full min-w-0">
          <div className="public-chatbar-input-wrap flex-1 min-w-0 relative">
            <textarea
              ref={fieldRef}
              value={input}
              onChange={onChange}
              onFocus={onFocus}
              onBlur={onBlur}
              onKeyDown={keySubmit}
              placeholder={SUGGESTIONS[suggestionIndex]}
              aria-label="Ask ANVIK anything…"
              rows={1}
              className="public-chatbar-input"
              autoComplete="off"
              spellCheck={false}
            />
            <span id="public-chatbar-hint" className="sr-only">
              Press Enter to send. Press Shift and Enter for a new line.
            </span>
          </div>
          <button
            type="submit"
            aria-label="Send message"
            disabled={!canSend}
            className={`public-chatbar-send shrink-0 transition-all ${!canSend ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Send className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Send</span>
          </button>
        </div>
        <div className="public-chatbar-toolbar flex items-center justify-between gap-2 pt-2">
          <span className="text-[10px] font-semibold tracking-wider text-[#77839a] uppercase">ANVIK · Chat</span>
          <button
            type="button"
            aria-label="Model selector"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#343842] bg-[#121827] text-[#dce1e9] hover:bg-[#171e2d] hover:border-[#5d6673] transition-colors"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  );
}
