"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertCircle,
  ArrowUp,
  AudioLines,
  Bell,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Eye,
  FileText,
  Focus,
 Image as ImageIcon,
  KeyRound,
  Menu,
  MessageSquarePlus,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { useChatStore, selectActiveConversation, type ChatMessage } from "@/store/use-chat-store";
import { ensureFreshChat } from "@/lib/fresh-chat";
import WebSearchMenu from "@/components/anvik/web-search-menu";
import SourcesPanel from "@/components/anvik/sources-panel";
import type { SearchMode } from "@/lib/search";
import { modes } from "@/lib/prompts";
import AnvikStar from "@/components/anvik/anvik-star";
import { Brand } from "@/components/anvik/navigation";
import Markdown from "@/components/anvik/markdown";
import ErrorBoundary from "@/components/anvik/error-boundary";
import {
  readApiKey,
  readDeviceId,
} from "@/lib/client-key";
import {
  mapClientFetchError,
  mapHttpErrorMessage,
  testGeminiKeyRequest,
} from "@/lib/client-api";
import { readMemory } from "@/lib/learning";
import { useSession } from "@/components/anvik/session-provider";

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

const PLACEHOLDERS = [
  "Ask ANVIK anything...",
  "Write code for Java topic...",
  "Explain Java OOP with example...",
  "Write Python code for calculator...",
  "Make a study plan for Class 12...",
  "Solve Physics numerical step by step...",
];

function ChatWorkspaceInner() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, credits, session, loading: sessionLoading, bearerToken, signOut, refresh } = useSession();
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
  const [focusMode, setFocusMode] = useState(false);
  const [search, setSearch] = useState("");
  const [listening, setListening] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("auto");
  const [showPalette, setShowPalette] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderFading, setPlaceholderFading] = useState(false);
  const [quotaDisplay, setQuotaDisplay] = useState<{ plan: string; remaining: number; limit: number } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechInput | null>(null);

  useEffect(() => {
    setHydrated(true);
    // Persisted Zustand state is already hydrated by now (zustand persist
    // hydrates synchronously on localStorage). A genuinely new browser tab —
    // or a login / OAuth / onboarding boundary that set a one-shot pending
    // request — starts with a fresh, empty conversation. Same-tab reloads and
    // route navigation preserve the current conversation.
    // Deep link from the Projects page (/chat?project=<id>): open that
    // conversation instead of starting a fresh one. Only consumed when the
    // target still exists — a stale link falls back to the fresh-chat contract.
    const projectId = new URLSearchParams(window.location.search).get("project");
    const targetProject = projectId
      ? useChatStore.getState().conversations.find((conversation) => conversation.id === projectId)
      : undefined;
    if (targetProject) {
      setActive(targetProject.id);
    } else {
      ensureFreshChat();
    }
    const mem = readMemory();
    setUserName(mem.name.trim());
    const prompt = new URLSearchParams(window.location.search).get("prompt");
    if (prompt) setInput(prompt.slice(0, 1600));
    const seenTip = localStorage.getItem("anvik-tip-seen");
    if (!seenTip) {
      setShowTooltip(true);
      setTimeout(() => {
        setShowTooltip(false);
        localStorage.setItem("anvik-tip-seen", "1");
      }, 5000);
    }
  }, [setActive]);

  useEffect(() => {
    const mem = readMemory();
    setUserName((current) => {
      const next = mem.name.trim();
      return next === current ? current : next;
    });
  }, [activeChat]);


  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeChat?.messages, pending]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
      if (e.key === "Escape") {
        setShowPalette(false);
        setShowPhotoMenu(false);
        setFocusMode(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Rotate the empty-input placeholder every 3 s with a smooth fade.
  // Rotation stops (and the placeholder hides) while the field is non-empty.
  const placeholderSwapRef = useRef<number | null>(null);
  useEffect(() => {
    if (input.trim()) {
      setPlaceholderFading(false);
      return;
    }
    const interval = window.setInterval(() => {
      setPlaceholderFading(true);
      placeholderSwapRef.current = window.setTimeout(() => {
        setPlaceholderIndex((index) => (index + 1) % PLACEHOLDERS.length);
        setPlaceholderFading(false);
      }, 420);
    }, 3000);
    return () => {
      window.clearInterval(interval);
      if (placeholderSwapRef.current) window.clearTimeout(placeholderSwapRef.current);
    };
  }, [input]);

  async function runInlineKeyTest() {
    setTestingKey(true);
    setKeyTestStatus(null);
    const res = await testGeminiKeyRequest();
    setTestingKey(false);
    setKeyTestStatus({ ok: res.ok, text: res.ok ? res.message : res.error });
    if (res.ok) setError("");
  }

  async function sendMessage(value = input) {
    const content = value.trim();
    if (!content || pending) return;

    const apiKey = readApiKey();
    const token = bearerToken();
    let quota: { hasServerKey: boolean; status: string; remaining: number; plan?: { id?: string; name?: string } | null; limit?: number };
    try {
      const quotaResponse = await fetch("/api/quota", {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}`, "x-anvik-device": readDeviceId() } : { "x-anvik-device": readDeviceId() },
      });
      if (quotaResponse.status === 401) {
        await signOut();
        router.replace("/login");
        return;
      }
      if (!quotaResponse.ok) throw new Error("Could not check the free chat limit. Please try again.");
      quota = (await quotaResponse.json()) as typeof quota;
      setQuotaDisplay({
        plan: quota.plan?.name ?? "Free",
        remaining: typeof quota.remaining === "number" ? quota.remaining : 0,
        limit: typeof quota.limit === "number" ? quota.limit : 10,
      });
    } catch (cause) {
      setError(mapClientFetchError(cause));
      return;
    }

    if (!apiKey && (!quota.hasServerKey || quota.status === "not_configured")) {
      setError("ANVIK free key not set. Connect your own key.");
      return;
    }
    if (!apiKey && quota.status === "invalid_server_key") {
      setError("ANVIK server key is invalid. Connect your own key to continue.");
      return;
    }
    if (!apiKey && (quota.status === "limit_reached" || quota.remaining <= 0)) {
      setError(
        session
          ? "You've reached your allowance. Connect your own key for unlimited, or upgrade at ANVIK pricing."
          : "Free limit reached. Connect your own key to continue unlimited.",
      );
      return;
    }

    const requestId = crypto.randomUUID();

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
          Accept: "text/event-stream",
          "x-anvik-device": readDeviceId(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(apiKey ? { "x-google-generative-ai-api-key": apiKey } : {}),
          "x-anvik-request-id": requestId,
        },
        body: JSON.stringify({
          messages: history,
          mode,
          temperature,
          memory: readMemory(),
          search: searchMode,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        if (response.status === 401) {
          await signOut();
          router.replace("/login");
          return;
        }
        const issue = (await response.json().catch(() => null)) as { error?: string; detail?: string; code?: string } | null;
        throw new Error(mapHttpErrorMessage(response.status, issue?.error ?? issue?.detail, issue?.code));
      }

      const modelUsed = response.headers.get("x-anvik-model") ?? "anvik-1.0";
      const isSSE = (response.headers.get("content-type") ?? "").includes("text/event-stream");

      let answer = "";
      // The done frame is authoritative. The header is only an advisory
      // promise set before the stream starts — never used to claim a verified
      // search.
      let finalSearchStatus: "on" | "off" | "unavailable" = "off";
      let finalSources: Array<{ title: string; uri: string; domain: string }> = [];
      let finalQueries: string[] = [];

      if (isSSE) {
        // Frame protocol: meta (first packet) -> tok(s) -> done (sources + queries).
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleFrame = (raw: string) => {
          const frame = raw.trim();
          if (!frame.startsWith("data:")) return;
          let parsed: { t?: string; s?: string; model?: string; search?: string; sources?: Array<{ title?: string; uri?: string; domain?: string }>; queries?: string[] };
          try {
            parsed = JSON.parse(frame.slice(5).trim());
          } catch {
            return;
          }
          if (parsed.t === "meta") {
            setMessageMeta(conversationId, assistantId, {
              source: "gemini",
              model: parsed.model ?? modelUsed,
              searchStatus: parsed.search === "on" || parsed.search === "unavailable" ? parsed.search : "off",
            });
          } else if (parsed.t === "tok" && typeof parsed.s === "string" && parsed.s) {
            answer += parsed.s;
            updateMessage(conversationId, assistantId, answer);
          } else if (parsed.t === "done") {
            if (parsed.search === "on" || parsed.search === "unavailable" || parsed.search === "off") {
              finalSearchStatus = parsed.search;
            }
            if (Array.isArray(parsed.sources)) {
              finalSources = parsed.sources
                .filter((s) => typeof s?.uri === "string" && s.uri.trim())
                .map((s) => ({
                  title: typeof s.title === "string" && s.title.trim() ? s.title.trim() : s.uri as string,
                  uri: s.uri as string,
                  domain: typeof s.domain === "string" && s.domain.trim() ? s.domain.trim() : (s.uri as string),
                }));
            }
            if (Array.isArray(parsed.queries)) {
              finalQueries = parsed.queries.filter((q): q is string => typeof q === "string" && !!q.trim());
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) handleFrame(frame);
        }
        buffer += decoder.decode();
        if (buffer.trim()) handleFrame(buffer);
      } else {
        // Raw UTF-8 stream (non-SSE deployments / fallback path).
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          answer += decoder.decode(chunk, { stream: true });
          updateMessage(conversationId, assistantId, answer);
        }
        answer += decoder.decode();
      }

      if (!answer.trim()) {
        const emptyMsg = "ANVIK could not answer. Check key or try again.";
        updateMessage(conversationId, assistantId, emptyMsg);
        setMessageMeta(conversationId, assistantId, { isError: true });
        setError(emptyMsg);
      } else {
        updateMessage(conversationId, assistantId, answer);
        setMessageMeta(conversationId, assistantId, {
          source: "gemini",
          model: modelUsed,
          isError: false,
          searchStatus: finalSearchStatus,
          sources: finalSources,
          queries: finalQueries,
        });
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
      // Refresh the displayed allowance after each request.
      void (async () => {
        const token = bearerToken();
        try {
          const quotaResponse = await fetch("/api/quota", {
            cache: "no-store",
            headers: token ? { Authorization: `Bearer ${token}`, "x-anvik-device": readDeviceId() } : { "x-anvik-device": readDeviceId() },
          });
          if (quotaResponse.ok) {
            const quotaBody = (await quotaResponse.json()) as { remaining?: number; limit?: number; plan?: { name?: string } | null };
            if (typeof quotaBody.remaining === "number") {
              setQuotaDisplay({
                plan: quotaBody.plan?.name ?? "Free",
                remaining: quotaBody.remaining,
                limit: typeof quotaBody.limit === "number" ? quotaBody.limit : 10,
              });
            }
          }
        } catch {
          /* the quota display is best-effort */
        }
      })();
      void refresh();
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

  function startRename(chatId: string, currentTitle: string) {
    setRenamingId(chatId);
    setRenameValue(currentTitle);
  }

  function confirmRename() {
    if (renamingId && renameValue.trim()) {
      const chats = useChatStore.getState().conversations;
      const chat = chats.find((c) => c.id === renamingId);
      if (chat) {
        const msgs = [...chat.messages];
        useChatStore.setState({
          conversations: chats.map((c) =>
            c.id === renamingId ? { ...c, title: renameValue.trim().slice(0, 60) } : c,
          ),
        });
        void msgs;
      }
    }
    setRenamingId(null);
    setRenameValue("");
  }

  const isEmptyInput = !input.trim();

  const renderChatbar = (options: { className: string; showTooltip?: boolean }) => (
    <form onSubmit={submit} className={options.className}>
      <div className="chatbar" data-typing={isEmptyInput ? "false" : "true"}>
        <div className="chatbar-inner">
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Add attachment"
              aria-expanded={showPhotoMenu}
              aria-haspopup="menu"
              onClick={() => setShowPhotoMenu((open) => !open)}
              className="chatbar-icon-btn"
            >
              <span className="text-lg leading-none" aria-hidden="true">+</span>
            </button>
            {showPhotoMenu && (
              <div role="menu" aria-label="Photo actions" className="absolute bottom-[calc(100%+10px)] left-0 z-30 w-44 rounded-xl border border-[#E5E5E5] bg-white p-1.5 shadow-lg">
                <a role="menuitem" href="/vision?source=upload" className="block rounded-lg px-3 py-2 text-left text-sm text-[#1A1A1A] hover:bg-[#F7F7F5]">Upload Photo</a>
                <a role="menuitem" href="/vision?camera=1" className="block rounded-lg px-3 py-2 text-left text-sm text-[#1A1A1A] hover:bg-[#F7F7F5]">Take Photo</a>
              </div>
            )}
            {options.showTooltip && showTooltip && (
              <div className="absolute left-2 bottom-[calc(100%+12px)] z-20 max-w-[260px] rounded-lg bg-[#1A1A1A] px-3 py-1.5 text-xs text-white tooltip-arrow">
                Try Take Photo — Ask about anything you see
              </div>
            )}
          </div>

          <WebSearchMenu mode={searchMode} onChange={setSearchMode} />

          <div className="chatbar-input-wrap">
            <span
              aria-hidden="true"
              className="chatbar-placeholder"
              data-show={isEmptyInput ? "true" : "false"}
              data-fade={placeholderFading ? "true" : "false"}
            >
              {PLACEHOLDERS[placeholderIndex]}
            </span>
            <textarea
              ref={fieldRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={keySubmit}
              placeholder=""
              aria-label="Message ANVIK"
              rows={1}
              disabled={pending}
              className="chatbar-input"
            />
          </div>

          <span className="hidden sm:inline shrink-0 text-xs font-medium text-[#999999]" aria-hidden="true">ANVIK 1.0</span>

          <select
            aria-label="Response mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as typeof mode)}
            className="hidden sm:inline-flex shrink-0 items-center rounded-lg border border-[#EDEDED] bg-white px-2 py-1.5 text-xs font-medium text-[#666666] transition-colors hover:border-[#1A1A1A] focus:outline-none"
          >
            {modes.map((item) => (
              <option value={item.id} key={item.id}>
                {item.label}
              </option>
            ))}
          </select>

          {pending ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop generating"
              className="chatbar-icon-btn shrink-0 border-[#1A1A1A] text-[#1A1A1A]"
            >
              <AudioLines className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={listen}
              aria-label={listening ? "Stop voice input" : "Use voice input"}
              aria-pressed={listening}
              className={`chatbar-icon-btn shrink-0 ${listening ? "chatbar-icon-btn-on" : ""}`}
            >
              <Mic className="h-4 w-4" />
            </button>
          )}

          <button
            type="submit"
            aria-label="Send message"
            disabled={!input.trim() || pending}
            className="send-btn shrink-0"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  );

  const safeConversations = hydrated ? conversations : [];
  const activeMessages = hydrated ? (activeChat?.messages ?? []) : [];
  const filteredChats = safeConversations.filter((chat) =>
    chat.title.toLowerCase().includes(search.toLowerCase()),
  );
  const showConnectButton = error.includes("Connect your own key");
  const showKeyHelper = showConnectButton || /key invalid|invalid or expired/i.test(error);

  const welcomeText = profile?.name ? `Welcome, ${profile.name}` : userName ? `Welcome, ${userName}` : "Welcome";

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-white">
      {/* ==================== Sidebar ==================== */}
      {!focusMode && (
        <aside
          aria-label="Sidebar"
          className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-[#EDEDED] bg-[#F7F7F5] sidebar-slide md:static md:z-auto md:translate-x-0 ${
            sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full md:visible"
          }`}
        >
          <div className="flex items-center justify-between px-4 py-4">
            <Brand />
            <button
              type="button"
              aria-label="Close sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#999999] hover:bg-[#EDEDED] hover:text-[#1A1A1A] md:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-3 pb-2">
            <button
              type="button"
              className="new-btn"
              onClick={() => {
                createConversation();
                setError("");
                setSidebarOpen(false);
              }}
            >
              <MessageSquarePlus className="h-4 w-4" />
              New
            </button>
          </div>

          <nav className="mt-1 px-3">
            {[
              { href: "/", label: "Chat", icon: MessageSquarePlus },
              { href: "/projects", label: "Projects", icon: FileText },
              { href: "/artifacts", label: "Artifacts", icon: Sparkles },
              { href: "/image", label: "Image", icon: ImageIcon },
              { href: "/code", label: "Code", icon: Code2 },
              { href: "/vision", label: "Vision", icon: Eye },
            ].map((item, i) => (
              <a
                key={`${item.label}-${i}`}
                href={item.href}
                className={`chat-item ${item.label === "Chat" ? pathname === "/" || pathname === "/chat" ? "active" : "" : pathname.startsWith(item.href) ? "active" : ""}`}
              >
                <item.icon className="h-4 w-4 shrink-0 text-[#999999]" />
                <span>{item.label}</span>
              </a>
            ))}
          </nav>

          <div className="mt-4 flex items-center justify-between px-4 pb-1">
            <span className="text-xs font-medium text-[#999999]">Chats</span>
            <button
              type="button"
              aria-label="Filter chats"
              className="flex h-6 w-6 items-center justify-center rounded text-[#999999] hover:text-[#1A1A1A]"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>

          <label className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-[#EDEDED] bg-white px-2.5 py-1.5 focus-within:border-[#1A1A1A]">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#999999]" />
            <span className="sr-only">Search conversations</span>
            <input
              aria-label="Search conversations"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
              className="w-full bg-transparent text-xs text-[#1A1A1A] placeholder:text-[#999999] focus:outline-none"
            />
          </label>

          <div className="flex-1 space-y-0.5 overflow-y-auto px-2 thin-scroll">
            {filteredChats.map((chat) => {
              const isActive = chat.id === activeId;
              const isRenaming = renamingId === chat.id;
              return (
                <div key={chat.id} className={`chat-item group ${isActive ? "active" : ""}`}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={confirmRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmRename();
                        if (e.key === "Escape") {
                          setRenamingId(null);
                          setRenameValue("");
                        }
                      }}
                      className="flex-1 bg-white px-1 text-xs text-[#1A1A1A] outline-none ring-1 ring-[#1A1A1A] rounded"
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center text-left"
                      onClick={() => {
                        setActive(chat.id);
                        setError("");
                        setSidebarOpen(false);
                      }}
                    >
                      <span className="truncate">{chat.title}</span>
                    </button>
                  )}
                  {!isRenaming && (
                    <div className="chat-actions flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-label="Rename chat"
                        title="Rename"
                        onClick={() => startRename(chat.id, chat.title)}
                        className="flex h-6 w-6 items-center justify-center rounded text-[#999999] hover:text-[#1A1A1A]"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${chat.title}`}
                        title="Delete"
                        onClick={() => deleteConversation(chat.id)}
                        className="flex h-6 w-6 items-center justify-center rounded text-[#999999] hover:text-[#1A1A1A]"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredChats.length === 0 && hydrated && (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-[#999999]">No chats yet</p>
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-[#1A1A1A] underline"
                  onClick={() => {
                    createConversation();
                    setError("");
                  }}
                >
                  Start new chat
                </button>
              </div>
            )}
          </div>

          <div className="mt-2 border-t border-[#EDEDED] px-3 py-3">
            <a
              href={session ? "/account" : "/login"}
              className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[#F0F0EE]"
            >
              <span aria-hidden="true" className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1A1A1A] text-xs font-semibold text-white">
                {profile?.avatarUrl ? (
                  <Image src={profile.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
                ) : (
                  (profile?.name?.trim().charAt(0).toUpperCase() || userName.trim().charAt(0).toUpperCase() || "A")
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1A1A1A]">
                {profile?.name || userName || (session ? "Your account" : "Sign in")}
              </span>
              <KeyRound className="h-4 w-4 shrink-0 text-[#999999]" aria-hidden="true" />
              <span className="sr-only">{session ? "Account settings" : "Sign in to ANVIK AI"}</span>
            </a>
            {!session && !sessionLoading && (
              <a href="/login" className="mt-1 block rounded-lg px-2 py-1.5 text-center text-xs font-semibold text-[#666666] hover:bg-[#F0F0EE]">
                Sign in
              </a>
            )}
          </div>
        </aside>
      )}

      {sidebarOpen && !focusMode && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/10 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* ==================== Main Area ==================== */}
      <section className="flex min-w-0 flex-1 flex-col bg-white">
        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5 border-b border-[#EDEDED]">
          <div className="flex items-center gap-2">
            {!focusMode && (
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#666666] hover:bg-[#F7F7F5] md:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
            {focusMode && (
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#666666] hover:bg-[#F7F7F5]"
                onClick={() => setFocusMode(false)}
                aria-label="Exit focus mode"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <span className="text-xs text-[#999999]">
              {quotaDisplay || credits
                ? `${quotaDisplay?.plan ?? credits?.planName ?? "Free"} · ${quotaDisplay?.remaining ?? credits?.dailyRemaining ?? 0} left`
                : "Free plan"}{" "}
              <a href="/pricing" className="text-[#666666] hover:text-[#1A1A1A] underline">Upgrade</a>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
  type="button"
  onClick={() => setShowPalette(true)}
  aria-label="Search conversations"
  className="flex items-center gap-1.5 rounded-lg border border-[#EDEDED] px-2.5 py-1.5 text-xs text-[#666666] hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline ml-1 rounded border border-[#EDEDED] px-1 text-[10px] text-[#999999]">Ctrl K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setFocusMode((v) => !v)}
              aria-label="Toggle focus mode"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                focusMode ? "bg-[#1A1A1A] text-white" : "text-[#666666] hover:bg-[#F7F7F5]"
              }`}
            >
              {focusMode ? <PanelLeftClose className="h-4 w-4" /> : <Focus className="h-4 w-4" />}
            </button>
            {!focusMode && (
              <button
                type="button"
                aria-label="Notifications"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#666666] hover:bg-[#F7F7F5]"
              >
                <Bell className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Message area */}
        <div className="flex-1 overflow-y-auto thin-scroll">
          {activeMessages.length === 0 ? (
            <div className="mx-auto flex max-w-[720px] flex-col items-center px-4 pt-14 pb-10 text-center sm:px-6 sm:pt-20">
              <AnvikStar size="lg" className="mb-4" />
              <h1
                className="welcome-fade-in font-serif text-[32px] font-normal leading-tight tracking-[-0.5px] text-[#1A1A1A]"
                style={{ letterSpacing: "-0.5px" }}
              >
                {welcomeText}
              </h1>

              <p className="mt-2 max-w-md text-sm leading-6 text-[#666666]">
                A calm space to think, create, and get things done.
              </p>

              {/* Glowing chatbar — welcome screen */}
              {renderChatbar({ className: "mt-8 w-full", showTooltip: true })}

              {error && (
                <div role="alert" className="mt-6 flex max-w-md flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EDEDED] bg-[#F7F7F5] px-4 py-3 text-xs text-[#666666]">
                  <span>{error}</span>
                  {showConnectButton && (
                    <a href="/settings" className="rounded-lg bg-[#1A1A1A] px-2.5 py-1.5 font-medium text-white hover:bg-[#333]">
                      Connect
                    </a>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-[720px] px-4 py-6">
              {activeMessages.map((message, index) => {
                const isUser = message.role === "user";
                const isLastAssistant = !isUser && index === activeMessages.length - 1;
                const isThinking = !isUser && !message.content && pending && isLastAssistant;
                const isStreaming = !isUser && pending && isLastAssistant && !!message.content;

                if (isUser) {
                  return (
                    <article key={message.id} className="msg-enter mb-6">
                      <p className="whitespace-pre-wrap text-[15px] leading-[1.7] text-[#1A1A1A]">{message.content}</p>
                    </article>
                  );
                }

                return (
                  <article key={message.id} className="msg-row msg-enter mb-8">
                    {isThinking ? (
                      <div className="flex items-center gap-3 py-2 text-sm text-[#999999]">
                        {message.searchStatus === "on" ? (
                          <>
                            <span className="search-pulse-dot" aria-hidden="true" />
                            <span>Searching the web…</span>
                          </>
                        ) : (
                          <>
                            <span className="typing-dots" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </span>
                            <span>ANVIK is thinking</span>
                          </>
                        )}
                      </div>
                    ) : message.isError ? (
                      <div className="rounded-xl border border-[#EDEDED] bg-[#F7F7F5] px-4 py-3 text-sm text-[#666666]">
                        {message.content}
                      </div>
                    ) : (
                      <>
                        <div className={isStreaming ? "stream-cursor" : ""}>
                          <Markdown text={message.content} className="md" />
                        </div>

                        {isStreaming && message.searchStatus === "on" && (
                          <div className="search-live-badge" role="status">
                            <span className="search-pulse-dot" aria-hidden="true" />
                            Searching the web…
                          </div>
                        )}

                        <div className="mt-1 text-xs text-[#999999]">ANVIK</div>

                        {!isStreaming && message.searchStatus && message.searchStatus !== "off" && (
                          <SourcesPanel
                            sources={message.sources ?? []}
                            queries={message.queries ?? []}
                            searchStatus={message.searchStatus}
                            defaultOpen={(message.sources?.length ?? 0) > 0}
                          />
                        )}

                        {/* Message toolbar */}
                        <div className="msg-toolbar mt-3 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void copyMessage(message)}
                            aria-label="Copy"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#999999] hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
                          >
                            {copied === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{copied === message.id ? "Copied" : "Copy"}</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Helpful"
                            onClick={() => setMessageMeta(activeChat?.id ?? "", message.id, { verdict: "like" })}
                            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-[#F7F7F5] ${
                              message.verdict === "like" ? "text-[#1A1A1A] font-medium" : "text-[#999999] hover:text-[#1A1A1A]"
                            }`}
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                            <span>Helpful</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Not right"
                            onClick={() => setMessageMeta(activeChat?.id ?? "", message.id, { verdict: "dislike" })}
                            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-[#F7F7F5] ${
                              message.verdict === "dislike" ? "text-[#1A1A1A] font-medium" : "text-[#999999] hover:text-[#1A1A1A]"
                            }`}
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                            <span>Not right</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Regenerate"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#999999] hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Regenerate</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Share"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#999999] hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            <span>Share</span>
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}

              {pending && activeMessages[activeMessages.length - 1]?.content && (
                <div className="flex items-center gap-2 pl-1 text-xs text-[#999999]">
                  <span className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              )}

              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Bottom composer (when in conversation) */}
        {activeMessages.length > 0 && (
          <div className="shrink-0 px-3 py-3 sm:px-6 sm:py-4">
            {error && (
              <div
                role="alert"
                className="mx-auto mb-2.5 flex max-w-[720px] flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EDEDED] bg-[#F7F7F5] px-3.5 py-2 text-xs text-[#666666]"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-[#999999]" />
                  <span>{error}</span>
                </div>
                {showKeyHelper && (
                  <div className="flex items-center gap-2">
                    {!showConnectButton && (
                      <button
                        type="button"
                        onClick={() => void runInlineKeyTest()}
                        disabled={testingKey}
                        className="rounded-lg border border-[#EDEDED] bg-white px-2.5 py-1 text-xs font-medium text-[#1A1A1A] hover:border-[#1A1A1A]"
                      >
                        {testingKey ? "Testing..." : "Test Key"}
                      </button>
                    )}
                    <a
                      href="/settings"
                      className="rounded-lg bg-[#1A1A1A] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#333]"
                    >
                      {showConnectButton ? "Connect" : "Settings"}
                    </a>
                  </div>
                )}
              </div>
            )}

            {keyTestStatus && (
              <div
                role="status"
                className={`mx-auto mb-2.5 flex max-w-[720px] items-center gap-2 rounded-xl border px-3.5 py-2 text-xs ${
                  keyTestStatus.ok
                    ? "border-[#EDEDED] bg-[#F7F7F5] text-[#1A1A1A]"
                    : "border-[#EDEDED] bg-[#F7F7F5] text-[#666666]"
                }`}
              >
                {keyTestStatus.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1A1A1A]" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-[#999999]" />
                )}
                <span>{keyTestStatus.text}</span>
              </div>
            )}

            {renderChatbar({ className: "mx-auto w-full max-w-[720px]" })}
          </div>
        )}
      </section>

      {/* ==================== Command Palette ==================== */}
      {showPalette && (
        <div
          className="palette-overlay fixed inset-0 z-[100] flex items-start justify-center bg-black/10 pt-[15vh] backdrop-blur-sm"
          onClick={() => setShowPalette(false)}
        >
          <div
            className="palette-panel w-full max-w-[560px] mx-4 rounded-2xl border border-[#EDEDED] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[#EDEDED] px-4 py-3">
              <Search className="h-4 w-4 text-[#999999]" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ask ANVIK anything..."
                className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#999999] focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setShowPalette(false);
                    void sendMessage(search);
                    setSearch("");
                  }
                }}
              />
              <kbd className="rounded border border-[#EDEDED] px-1.5 py-0.5 text-[10px] text-[#999999]">ESC</kbd>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2 thin-scroll">
              {filteredChats.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-medium text-[#999999]">Chats</div>
                  {filteredChats.slice(0, 6).map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      className="chat-item w-full"
                      onClick={() => {
                        setActive(chat.id);
                        setShowPalette(false);
                        setSearch("");
                      }}
                    >
                      <MessageSquarePlus className="h-4 w-4 text-[#999999]" />
                      <span className="truncate">{chat.title}</span>
                    </button>
                  ))}
                </>
              )}
              <div className="px-2 py-1.5 text-xs font-medium text-[#999999]">Actions</div>
              {[
                { label: "New chat", icon: MessageSquarePlus, action: () => { createConversation(); setShowPalette(false); } },
                { label: "Image Studio", icon: ImageIcon, href: "/image" },
                { label: "Vision Studio", icon: Eye, href: "/vision" },
                { label: "Settings", icon: KeyRound, href: "/settings" },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href ?? "#"}
                  onClick={item.action}
                  className="chat-item w-full"
                >
                  <item.icon className="h-4 w-4 text-[#999999]" />
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
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
