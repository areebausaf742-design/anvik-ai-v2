"use client";

import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import Markdown from "@/components/anvik/markdown";
import { readDeviceId } from "@/lib/client-key";

const SUGGESTIONS = [
  "Explain quantum computing like I'm twelve",
  "Write a Python script that renames my files",
  "Plan my mid-term study schedule",
  "Describe a futuristic city at golden hour",
  "Summarize this research paper's key findings",
];

type Msg = { id: string; role: "user" | "assistant"; content: string; isError?: boolean };

/**
 * Public landing-page chat. Guests get 10 free answers/day via the secure guest
 * quota (IP-based, atomic RPC, charged only after a successful stream). After
 * the 10 free answers are exhausted, the API returns guest_limit_reached and we
 * show a sign-in prompt with the draft preserved.
 *
 * Security: no token is sent (guest). The server enforces the guest quota,
 * rate limits (60/min per IP), injection scanning, secret stripping and payload
 * limits. /chat and all other surfaces remain protected by the edge middleware.
 */
export function PublicChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [guestLimitReached, setGuestLimitReached] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const cycle = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setSuggestionIndex((i) => (i + 1) % SUGGESTIONS.length);
    }, 3200);
  }, [clearTimer]);

  // Living placeholder cycles; pauses on focus/typing.
  // (cycle is invoked on mount and on focus/blur in the textarea handlers)

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const content = input.trim();
    if (!content || pending) return;

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setError("");
    setPending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let answer = "";
    let streamError = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "x-anvik-device": readDeviceId(),
          "x-anvik-request-id": crypto.randomUUID(),
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(({ role, content: c }) => ({ role, content: c })),
          mode: "smart",
          temperature: 0.65,
          search: "auto",
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const issue = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
        if (issue?.code === "guest_limit_reached") {
          setGuestLimitReached(true);
          // Stash draft + destination for post-sign-in restore.
          try {
            sessionStorage.setItem("anvik-pending-draft", content);
            sessionStorage.setItem("anvik-pending-destination", "/chat");
          } catch {
            /* storage unavailable */
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: "", isError: true } : m,
            ),
          );
          // Remove the empty assistant bubble; keep the user message.
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          setError("You've used today's free questions. Sign in for more — it's free, and your history follows you.");
          return;
        }
        const msg = issue?.error ?? "ANVIK could not answer. Please try again.";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: msg, isError: true } : m)),
        );
        setError(msg);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const trimmed = frame.trim();
          if (!trimmed.startsWith("data:")) continue;
          let parsed: { t?: string; s?: string; message?: string };
          try {
            parsed = JSON.parse(trimmed.slice(5).trim());
          } catch {
            continue;
          }
          if (parsed.t === "tok" && typeof parsed.s === "string" && parsed.s) {
            answer += parsed.s;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: answer } : m)),
            );
          } else if (parsed.t === "err") {
            streamError = parsed.message ?? "ANVIK lost the connection before finishing. Please try again.";
          }
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data:")) {
          try {
            const parsed = JSON.parse(trimmed.slice(5).trim());
            if (parsed.t === "tok" && typeof parsed.s === "string" && parsed.s) {
              answer += parsed.s;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: answer } : m)),
              );
            }
          } catch {
            /* partial frame */
          }
        }
      }

      if (streamError) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: answer.trim() ? answer : streamError, isError: !answer.trim() } : m,
          ),
        );
        setError(streamError);
      } else if (!answer.trim()) {
        const msg = "ANVIK could not answer. Check key or try again.";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: msg, isError: true } : m)),
        );
        setError(msg);
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: "_(stopped — ask again to continue)_" } : m,
          ),
        );
      } else {
        const msg = "ANVIK could not reach the server. Please try again.";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: msg, isError: true } : m)),
        );
        setError(msg);
      }
    } finally {
      abortRef.current = null;
      setPending(false);
      // Scroll to bottom
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  };

  const keySubmit = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const goToSignIn = () => {
    try {
      sessionStorage.setItem("anvik-pending-destination", "/chat");
    } catch {
      /* storage unavailable */
    }
    router.push("/login");
  };

  return (
    <section className="public-hero" aria-label="Hero">
      <div className="public-hero-inner">
        <div className="public-hero-brand flex items-center gap-2">
          <span className="public-hero-mark" aria-hidden="true">◆</span>
          <span className="public-hero-name">ANVIK<span className="public-hero-ai">AI</span></span>
        </div>
        <h1 className="public-hero-heading">
          Ask anything.<br />
          Get instant, intelligent answers.
        </h1>
        <p className="public-hero-sub">
          A calm, confident workspace for questions, code, images and vision —
          in English, Hindi or Hinglish. Ten free questions a day; sign in to
          keep your history, credits and consent.
        </p>

        {/* Chat area */}
        {messages.length > 0 && (
          <div
            ref={scrollRef}
            className="public-chat-area mx-auto mb-6 max-w-[720px] max-h-[40vh] overflow-y-auto text-left space-y-4"
            aria-live="polite"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={m.role === "user" ? "public-chat-user" : "public-chat-assistant"}
              >
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap text-[15px] leading-[1.7] text-[var(--theme-text)]">{m.content}</p>
                ) : m.content ? (
                  <div className={pending && m.id === messages[messages.length - 1]?.id ? "stream-cursor" : ""}>
                    <Markdown text={m.content} className="md" />
                  </div>
                ) : pending ? (
                  <span className="thinking-sweep text-sm">Anvik is thinking</span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Chat bar */}
        <form onSubmit={submit} className="public-chatbar relative">
          <span className="public-chatbar-glow" aria-hidden="true" />
          <div className="public-chatbar-inner relative z-10">
            <div className="public-chatbar-row flex items-center gap-3 w-full min-w-0">
              <div className="public-chatbar-input-wrap flex-1 min-w-0 relative">
                <textarea
                  id="public-chatbar-input"
                  name="prompt"
                  ref={fieldRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    const f = fieldRef.current;
                    if (f) { f.style.height = "auto"; f.style.height = `${Math.min(f.scrollHeight, 160)}px`; }
                  }}
                  onFocus={() => { clearTimer(); cycle(); }}
                  onBlur={() => cycle()}
                  onKeyDown={keySubmit}
                  placeholder={SUGGESTIONS[suggestionIndex]}
                  aria-label="Ask ANVIK anything…"
                  rows={1}
                  className="public-chatbar-input"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                />
              </div>
              <button
                type="submit"
                aria-label="Send message"
                disabled={!input.trim() || pending}
                className={`public-chatbar-send shrink-0 transition-all ${!input.trim() || pending ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Send className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="public-chatbar-toolbar flex items-center justify-between gap-2 pt-2">
              <span className="text-[10px] font-semibold tracking-wider text-[#77839a] uppercase">ANVIK · Chat</span>
            </div>
          </div>
        </form>

        {error && (
          <div className="mx-auto mt-3 max-w-[720px] rounded-xl border border-[#EDEDED] bg-[#F7F7F5] px-4 py-3 text-center text-sm text-[#666666]">
            {error}
            {guestLimitReached && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={goToSignIn}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-white hover:bg-[#333333]"
                >
                  Sign in (free) <span aria-hidden>→</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={goToSignIn}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-5 py-2.5 text-sm font-medium text-[var(--theme-text)] hover:bg-[var(--theme-surface-hover)] transition-colors"
          >
            Sign in <span className="text-[var(--theme-text-secondary)]" aria-hidden>→</span>
          </button>
          <button
            type="button"
            onClick={goToSignIn}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)] transition-colors"
          >
            Create a free account
          </button>
        </div>
        <p className="public-hero-note">
          Ten free questions a day — no account needed to try. Sign in to keep your history, credits and consent.
        </p>
      </div>
    </section>
  );
}
