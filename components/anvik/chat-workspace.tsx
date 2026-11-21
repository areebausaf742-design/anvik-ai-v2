"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  Check,
  CheckCircle2,
  Copy,
  ImagePlus,
  KeyRound,
  Menu,
  MessageSquarePlus,
  Mic,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useChatStore, selectActiveConversation, type ChatMessage } from "@/store/use-chat-store";
import { modes, promptIdeas } from "@/lib/prompts";
import Orb from "@/components/anvik/orb";
import Markdown from "@/components/anvik/markdown";
import FeedbackBar from "@/components/anvik/feedback-bar";
import ErrorBoundary from "@/components/anvik/error-boundary";
import TiltCard from "@/components/anvik/tilt-card";
import {
  KEY_FORMAT_MESSAGE,
  isValidGeminiKey,
  readDeviceId,
  readRawApiKey,
  recordDailyUsage,
} from "@/lib/client-key";
import {
  mapClientFetchError,
  mapHttpErrorMessage,
  testGeminiKeyRequest,
  validateStoredKeyBeforeSend,
} from "@/lib/client-api";
import { readMemory } from "@/lib/learning";

type SpeechInput = {
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop?: () => void;
};
type SpeechInputConstructor = new () => SpeechInput;

function makeId() {
  return crypto.randomUUID();
}

function ChatWorkspaceInner() {
  const conversations = useChatStore((state) => state.conversations);
  const activeId = useChatStore((state) => state.activeId);
  const mode = useChatStore((state) => state.mode);
  const temperature = useChatStore((state) => state.temperature);
  const activeChat = useChatStore(selectActiveConversation);
  const createConversation = useChatStore((state) => state.createConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const setActive = useChatStore((state) => state.setActive);
  const setMode = useChatStore((state) => state.setMode);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setMessageMeta = useChatStore((state) => state.setMessageMeta);

  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [keyTestStatus, setKeyTestStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testingKey, setTestingKey] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [listening, setListening] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [hasValidKey, setHasValidKey] = useState(true);

  const endRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechInput | null>(null);

  useEffect(() => {
    setHydrated(true);
    const raw = readRawApiKey();
    setHasValidKey(raw.length === 0 ? false : isValidGeminiKey(raw));
    const prompt = new URLSearchParams(window.location.search).get("prompt");
    if (prompt) setInput(prompt.slice(0, 1600));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeChat?.messages, pending]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function runInlineKeyTest() {
    setTestingKey(true);
    setKeyTestStatus(null);
    const res = await testGeminiKeyRequest();
    setTestingKey(false);
    setKeyTestStatus({ ok: res.ok, text: res.ok ? res.message : res.error });
    if (res.ok) {
      setError("");
      setHasValidKey(true);
    }
  }

  async function sendMessage(value = input) {
    const content = value.trim();
    if (!content || pending) return;

    const keyCheck = validateStoredKeyBeforeSend();
    if (!keyCheck.ok) {
      setError(keyCheck.error);
      setHasValidKey(false);
      return;
    }

    const conversationId = activeId ?? createConversation();
    const current = useChatStore.getState().conversations.find((item) => item.id === conversationId);
    const userMessage: ChatMessage = { id: makeId(), role: "user", content, createdAt: Date.now() };
    const assistantId = makeId();
    addMessage(conversationId, userMessage);
    addMessage(conversationId, { id: assistantId, role: "assistant", content: "", createdAt: Date.now() });
    setInput("");
    setPending(true);
    setError("");
    setKeyTestStatus(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = [...(current?.messages ?? []), userMessage]
        .slice(-40)
        .map(({ role, content: text }) => ({ role, content: text }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anvik-device": readDeviceId(),
          ...(keyCheck.apiKey ? { "x-google-generative-ai-api-key": keyCheck.apiKey } : {}),
        },
        body: JSON.stringify({
          messages: history,
          mode,
          temperature,
          memory: readMemory(),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const issue = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
        throw new Error(mapHttpErrorMessage(response.status, issue?.error ?? issue?.detail));
      }

      const modelUsed = response.headers.get("x-anvik-model") ?? "gemini-2.0-flash";
      const label = response.headers.get("x-anvik-label") ?? "From Gemini";

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        answer += decoder.decode(chunk, { stream: true });
        updateMessage(conversationId, assistantId, answer);
      }
      answer += decoder.decode();

      if (!answer.trim()) {
        const emptyMsg = "Gemini returned an empty response. Please try again.";
        updateMessage(conversationId, assistantId, emptyMsg);
        setMessageMeta(conversationId, assistantId, { isError: true });
        setError(emptyMsg);
      } else {
        updateMessage(conversationId, assistantId, answer);
        setMessageMeta(conversationId, assistantId, {
          source: "gemini",
          model: modelUsed,
          credit: label,
          isError: false,
        });
        recordDailyUsage(modelUsed);
      }
    } catch (cause) {
      if (controller.signal.aborted) {
        updateMessage(conversationId, assistantId, "_(stopped — ask again to continue)_");
      } else {
        const message = mapClientFetchError(cause);
        updateMessage(conversationId, assistantId, message);
        setMessageMeta(conversationId, assistantId, { isError: true });
        setError(message);
      }
    } finally {
      abortRef.current = null;
      setPending(false);
      fieldRef.current?.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function keySubmit(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function listen() {
    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechInputConstructor;
      webkitSpeechRecognition?: SpeechInputConstructor;
    };
    const Speech = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Speech) {
      setError("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    const recognition = new Speech();
    recognition.lang = "en-IN";
    recognition.onresult = (event) => {
      const said = event.results[0][0].transcript;
      setInput((text) => `${text}${text ? " " : ""}${said}`);
      setListening(false);
    };
    recognition.onerror = () => {
      setError("Voice input could not start. Check microphone permissions.");
      setListening(false);
    };
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
    setError("");
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Could not copy that response.");
    }
  }

  const safeConversations = hydrated ? conversations : [];
  const activeMessages = hydrated ? (activeChat?.messages ?? []) : [];
  const filteredChats = safeConversations.filter((chat) =>
    chat.title.toLowerCase().includes(search.toLowerCase()),
  );
  const showKeyHelper =
    error === KEY_FORMAT_MESSAGE ||
    error.toLowerCase().includes("key") ||
    error.toLowerCase().includes("aistudio");

  return (
    <div className="relative flex h-[calc(100dvh-105px)] w-full overflow-hidden bg-[#050508] sm:h-[calc(100dvh-61px)]">
      {/* Left Sidebar */}
      <aside
        aria-label="Chat history"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-[#08080f]/95 p-4 backdrop-blur-2xl transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-3 lg:hidden">
          <span className="text-sm font-bold tracking-tight gradient-text">Conversations</span>
          <button
            type="button"
            aria-label="Close sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          className="btn-gradient flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          onClick={() => {
            createConversation();
            setError("");
            setSidebarOpen(false);
          }}
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          New chat
        </button>

        <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300 focus-within:border-[#22D3EE]/60">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="sr-only">Search conversations</span>
          <input
            aria-label="Search conversations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats..."
            className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
          />
        </label>

        <div className="mt-4 mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span>History</span>
          <span>{filteredChats.length}</span>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto pr-1">
          {filteredChats.map((chat) => {
            const isActive = chat.id === activeId;
            return (
              <div
                key={chat.id}
                className={`group flex items-center gap-1 rounded-xl border px-2 py-1.5 transition ${
                  isActive
                    ? "border-[#7C3AED]/50 bg-[#7C3AED]/15 text-white"
                    : "border-transparent text-slate-300 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium"
                  onClick={() => {
                    setActive(chat.id);
                    setError("");
                    setSidebarOpen(false);
                  }}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      isActive ? "bg-[#22D3EE] shadow-[0_0_8px_#22D3EE]" : "bg-slate-600"
                    }`}
                  />
                  <span className="truncate">{chat.title}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${chat.title}`}
                  title="Delete chat"
                  onClick={() => deleteConversation(chat.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-80 transition hover:bg-rose-500/20 hover:text-rose-300 sm:opacity-60 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })}
          {filteredChats.length === 0 && (
            <p className="px-2 py-4 text-xs text-slate-500">
              Your Gemini conversations will appear here.
            </p>
          )}
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          <div className="flex items-center justify-between font-semibold text-white">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
              Powered by Gemini
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Live streaming via gemini-2.0-flash with automatic 2.5 &amp; 1.5 fallback.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-xs">
          <Link
            href="/image"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-slate-300 hover:bg-white/[0.08] hover:text-white"
          >
            <ImagePlus className="h-3.5 w-3.5 text-[#22D3EE]" aria-hidden="true" />
            <span>Image</span>
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-slate-300 hover:bg-white/[0.08] hover:text-white"
          >
            <KeyRound className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true" />
            <span>API Key</span>
          </Link>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* Main Chat Pane */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Sub-header with centered animated Orb */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#050508]/80 px-3 py-2 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open chat history"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                createConversation();
                setError("");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 lg:hidden"
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-[#22D3EE]" />
              <span>New</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <Orb size="mini" active={pending} />
            <div className="leading-tight">
              <span className="block text-sm font-bold tracking-tight gradient-text">ANVIK</span>
              <span className="block text-[10px] font-medium tracking-wider text-slate-400">
                {pending ? "STREAMING LIVE" : "ONE MIND · GEMINI"}
              </span>
            </div>
          </div>

          <label className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300">
            <span className="hidden text-slate-400 sm:inline">Mode</span>
            <select
              aria-label="AI mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
              className="bg-transparent text-xs font-medium text-white focus:outline-none"
            >
              {modes.map((item) => (
                <option value={item.id} key={item.id} className="bg-[#0b0b14] text-white">
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Scrollable Message Area */}
        <div className="flex-1 overflow-y-auto px-3 py-5 sm:px-6">
          {!hasValidKey && activeMessages.length === 0 && (
            <div className="mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#7C3AED]/40 bg-[#7C3AED]/10 px-4 py-3 text-xs text-slate-200">
              <span>
                Add your free Google AI Studio key in Settings to start chatting live with Gemini.
              </span>
              <Link
                href="/settings"
                className="inline-flex items-center gap-1 font-semibold text-[#22D3EE] hover:underline"
              >
                Add Gemini Key <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          {activeMessages.length === 0 ? (
            <div className="mx-auto flex max-w-3xl flex-col items-center py-6 text-center sm:py-10">
              <Orb size="large" active={pending} />
              <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
                One Mind.{" "}
                <span className="gradient-text">Infinite Possibilities.</span>
              </h1>
              <p className="mt-2 max-w-lg text-sm text-slate-400">
                Ask anything in English, Hindi, or Hinglish. Every reply streams straight from Gemini.
              </p>

              <div className="mt-7 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2">
                {promptIdeas.map(({ title, text }) => (
                  <TiltCard key={title} className="glass-card rounded-2xl">
                    <button
                      type="button"
                      onClick={() => void sendMessage(text)}
                      className="flex h-full w-full items-start justify-between gap-3 p-4 text-left"
                    >
                      <div>
                        <b className="block text-sm font-semibold text-white">{title}</b>
                        <small className="mt-1 block text-xs leading-relaxed text-slate-400">
                          {text}
                        </small>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-[#22D3EE]" aria-hidden="true" />
                    </button>
                  </TiltCard>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {activeMessages.map((message, index) => {
                const isUser = message.role === "user";
                const isLastAssistant = !isUser && index === activeMessages.length - 1;
                const isThinking = !isUser && !message.content && pending && isLastAssistant;

                if (isUser) {
                  return (
                    <article key={message.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-[#7C3AED]/45 bg-gradient-to-br from-[#7C3AED]/30 to-[#7C3AED]/15 px-4 py-3 text-sm leading-relaxed text-white shadow-lg shadow-[#7C3AED]/10 backdrop-blur-md sm:max-w-[72%]">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-violet-200/80">
                          You
                        </span>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </article>
                  );
                }

                return (
                  <article key={message.id} className="flex items-start gap-3">
                    <div className="mt-1 shrink-0">
                      <Orb size="mini" active={pending && isLastAssistant} />
                    </div>
                    <div
                      className={`min-w-0 flex-1 rounded-2xl rounded-bl-sm border px-4 py-3.5 backdrop-blur-xl ${
                        message.isError
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
                          : "border-white/15 bg-white/[0.06] text-slate-100 shadow-lg shadow-black/30"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold tracking-wider gradient-text">
                            ANVIK
                          </span>
                          {!message.isError && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#67e8f9]">
                              From Gemini
                            </span>
                          )}
                        </div>

                        {message.content && !isThinking && !message.isError && (
                          <button
                            type="button"
                            onClick={() => void copyMessage(message)}
                            aria-label="Copy response"
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                          >
                            {copied === message.id ? (
                              <Check className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>{copied === message.id ? "Copied" : "Copy"}</span>
                          </button>
                        )}
                      </div>

                      {isThinking ? (
                        <div className="flex items-center gap-3 py-1 text-sm text-slate-300">
                          <span className="typing-dots" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                          <span>ANVIK is thinking</span>
                        </div>
                      ) : message.isError ? (
                        <div className="space-y-2 text-sm text-rose-200">
                          <p>{message.content}</p>
                        </div>
                      ) : (
                        <Markdown text={message.content} className="md" />
                      )}

                      {message.content && !pending && !message.isError && (
                        <FeedbackBar
                          question={questionFor(activeMessages, message.id)}
                          answer={message.content}
                          credit={message.credit ?? "From Gemini"}
                          model={message.model}
                          verdict={message.verdict}
                          taught={message.taught}
                          onVerdict={(verdict) =>
                            setMessageMeta(activeChat?.id ?? "", message.id, { verdict })
                          }
                          onTaught={() =>
                            setMessageMeta(activeChat?.id ?? "", message.id, { taught: true })
                          }
                          onError={setError}
                        />
                      )}
                    </div>
                  </article>
                );
              })}

              {pending && activeMessages[activeMessages.length - 1]?.content && (
                <div className="flex items-center gap-2 pl-11 text-xs text-slate-400">
                  <span className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span>ANVIK is thinking...</span>
                </div>
              )}

              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Bottom Composer Dock */}
        <div className="shrink-0 border-t border-white/10 bg-[#050508]/95 px-3 py-2.5 backdrop-blur-xl sm:px-6 sm:py-3">
          {error && (
            <div
              role="alert"
              className="mx-auto mb-2.5 flex max-w-3xl flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-200"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
                <span>{error}</span>
              </div>
              {showKeyHelper && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runInlineKeyTest()}
                    disabled={testingKey}
                    className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20"
                  >
                    {testingKey ? "Testing..." : "Test Key"}
                  </button>
                  <Link
                    href="/settings"
                    className="rounded-lg bg-[#7C3AED] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#6d28d9]"
                  >
                    Settings
                  </Link>
                </div>
              )}
            </div>
          )}

          {keyTestStatus && (
            <div
              role="status"
              className={`mx-auto mb-2.5 flex max-w-3xl items-center gap-2 rounded-xl border px-3.5 py-2 text-xs ${
                keyTestStatus.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-200"
              }`}
            >
              {keyTestStatus.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              )}
              <span>{keyTestStatus.text}</span>
            </div>
          )}

          <form
            onSubmit={submit}
            className="mx-auto max-w-3xl rounded-2xl border border-white/15 bg-white/[0.05] p-2.5 shadow-xl shadow-black/50 focus-within:border-[#7C3AED]/60"
          >
            <textarea
              ref={fieldRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={keySubmit}
              placeholder="Ask ANVIK anything..."
              aria-label="Message ANVIK"
              rows={1}
              disabled={pending}
              className="max-h-36 min-h-[40px] w-full resize-none bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-slate-400 focus:outline-none"
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={listen}
                  aria-label={listening ? "Stop voice input" : "Use voice input"}
                  aria-pressed={listening}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
                    listening
                      ? "border-[#22D3EE] bg-[#22D3EE]/20 text-[#22D3EE]"
                      : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Mic className="h-4 w-4" />
                </button>
                {pending && (
                  <button
                    type="button"
                    onClick={stop}
                    aria-label="Stop generating"
                    className="flex h-9 items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
                  >
                    <AudioLines className="h-3.5 w-3.5" />
                    Stop
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-300">
                  <Sparkles className="h-3 w-3 text-[#22D3EE]" aria-hidden="true" />
                  POWERED BY GEMINI
                </span>
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!input.trim() || pending}
                  className="btn-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

export default function ChatWorkspace() {
  return (
    <ErrorBoundary title="Chat workspace hit an unexpected error">
      <ChatWorkspaceInner />
    </ErrorBoundary>
  );
}

function questionFor(messages: ChatMessage[], replyId: string): string {
  const index = messages.findIndex((message) => message.id === replyId);
  for (let i = index - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

export function deviceId(): string {
  return readDeviceId();
}
