"use client";

import React from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
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
import { useChatStore, selectActiveConversation, type ChatMessage, type Conversation } from "@/store/use-chat-store";
import { getActiveProviderId, getProviderBadge } from "@/lib/providers";
import { ensureFreshChat } from "@/lib/fresh-chat";
import { canSendMessage, composerBlockReason, COMPOSER_ERROR, COMPOSER_NOTICE } from "@/lib/composer";
import { filterPaletteActions, filterPaletteChats, restorePaletteFocus } from "@/lib/palette";
import { wrapIndex } from "@/lib/keyboard-nav";
import { brandedModelLabel, modeLabel } from "@/lib/prompts";
import DeepSearchToggle from "@/components/anvik/deep-search-toggle";
import ChatbarLight from "@/components/anvik/chatbar-light";
import { motion } from "motion/react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import ModelSelector from "@/components/anvik/model-selector";
import SourcesPanel from "@/components/anvik/sources-panel";
import type { SearchSource } from "@/lib/search";
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
import { greetingFirstName } from "@/lib/session";
import { activateChatOwner, resolveChatOwner } from "@/lib/chat-owner";
import { useSession } from "@/components/anvik/session-provider";

type SpeechInput = {
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop?: () => void;
};
type SpeechInputConstructor = new () => SpeechInput;

type PaletteEntry = {
  id: string;
  label: string;
  icon: typeof MessageSquarePlus;
  run: () => void;
};

function makeId() {
  return crypto.randomUUID();
}

const VirtuosoList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function VirtuosoList(props, ref) {
  return <div {...props} ref={ref} className="anvik-message-list mx-auto w-full" />;
});
VirtuosoList.displayName = "VirtuosoList";

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
  const deleteConversationWithUndo = useChatStore((state) => state.deleteConversationWithUndo);
  const undoDelete = useChatStore((state) => state.undoDelete);
  const clearDeletedConversations = useChatStore((state) => state.clearDeletedConversations);
  const deletedConversations = useChatStore((state) => state.deletedConversations);
  const setActive = useChatStore((state) => state.setActive);
  const setMode = useChatStore((state) => state.setMode);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setMessageMeta = useChatStore((state) => state.setMessageMeta);

  const [hydrated, setHydrated] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [keyTestStatus, setKeyTestStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testingKey, setTestingKey] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [search, setSearch] = useState("");
  const [headerSearch, setHeaderSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [listening, setListening] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [chatFocused, setChatFocused] = useState(false);
  const [searchMode, setSearchMode] = useState<"auto" | "on" | "off">("auto");
  const [showPalette, setShowPalette] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [quotaDisplay, setQuotaDisplay] = useState<{ plan: string; remaining: number; limit: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const headerSearchRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechInput | null>(null);
  const photoMenuRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteOpenRef = useRef(false);
  const sendingRef = useRef(false);
  const undoTimerRef = useRef<number | null>(null);
  const paletteOpenerRef = useRef<HTMLElement | null>(null);
  const paletteOpenRef = useRef(false);

  const openPalette = useCallback((opener?: HTMLElement | null, initialQuery = "") => {
    paletteOpenerRef.current =
      opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    paletteOpenRef.current = true;
    setPaletteQuery(initialQuery);
    setPaletteIndex(0);
    setShowPalette(true);
  }, []);

  const closePalette = useCallback((options?: { restoreFocus?: boolean }) => {
    const opener = paletteOpenerRef.current;
    paletteOpenerRef.current = null;
    paletteOpenRef.current = false;
    setShowPalette(false);
    setPaletteQuery("");
    setPaletteIndex(0);
    if (options?.restoreFocus) restorePaletteFocus(opener);
  }, []);

  const composerReadiness = {
    identityReady,
    sessionLoading,
    hasSession: Boolean(session),
    hasProfile: Boolean(profile),
  };
  const composerBlock = composerBlockReason(composerReadiness);

  useEffect(() => {
    setHydrated(true);
    // Do not read the persisted chat store until the verified account namespace
    // has been selected below. Legacy unscoped history is intentionally not
    // imported because its owner cannot be proven.
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
  }, []);

  const identityRef = useRef<string | null>(null);

  // Wait for server-verified identity before switching the persisted store.
  // The switch itself lives in lib/chat-owner.ts so /projects (and anything else
  // that reads history) applies exactly the same rules.
  useEffect(() => {
    const owner = resolveChatOwner({
      sessionLoading,
      hasSession: Boolean(session),
      hasProfile: Boolean(profile),
      userId: profile?.id,
    });

    if (!owner) {
      abortRef.current?.abort();
      setPending(false);
      setIdentityReady(false);
      return;
    }

    if (identityRef.current === owner) {
      setIdentityReady(true);
      return;
    }

    setIdentityReady(false);
    abortRef.current?.abort();
    setPending(false);
    identityRef.current = owner;
    void activateChatOwner(owner)
      .catch(() => undefined)
      .finally(() => {
        // Guard against a stale switch landing after a newer one started.
        if (identityRef.current === owner) setIdentityReady(true);
      });
  }, [sessionLoading, session, profile]);

  useEffect(() => {
    if (!hydrated || !identityReady) return;
    const projectId = new URLSearchParams(window.location.search).get("project");
    const targetProject = projectId
      ? useChatStore.getState().conversations.find((conversation) => conversation.id === projectId)
      : undefined;
    if (targetProject) setActive(targetProject.id);
    else ensureFreshChat();
  }, [hydrated, identityReady, setActive]);


  const [showScrollPill, setShowScrollPill] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Auto-scroll is now handled by Virtuoso's followOutput; the legacy rAF
  // scroller is intentionally disabled to avoid fighting the virtualizer.
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
      if (atBottom) node.scrollTo({ top: node.scrollHeight, behavior: "auto" });
      else setShowScrollPill(true);
    });
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [activeChat?.messages, pending]);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "smooth" });
    setShowScrollPill(false);
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 180)}px`;
    field.style.overflowY = field.scrollHeight > 180 ? "auto" : "hidden";
  }, [input]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!showPhotoMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (photoMenuRef.current && !photoMenuRef.current.contains(event.target as Node)) {
        setShowPhotoMenu(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [showPhotoMenu]);

  useEffect(() => {
    deleteOpenRef.current = Boolean(deleteTarget);
  }, [deleteTarget]);

  useEffect(() => {
    if (!deleteTarget) return;
    const trigger = deleteTriggerRef.current;
    const focusTimer = window.setTimeout(() => deleteCancelRef.current?.focus(), 0);
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const dialog = deleteDialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDeleteTarget(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])",
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialog.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      let target: HTMLElement | null = trigger;
      if (!target || !document.contains(target)) {
        target = document.querySelector<HTMLElement>("#anvik-new-chat, [data-new-chat]");
      }
      if (target) {
        try { target.focus(); } catch {  }
      }
    };
  }, [deleteTarget]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (paletteOpenRef.current) closePalette({ restoreFocus: true });
        else openPalette();
      }
      if (e.key === "Escape") {
        if (deleteOpenRef.current) {
          setDeleteTarget(null);
          return;
        }
        if (paletteOpenRef.current) closePalette({ restoreFocus: true });
        setShowPhotoMenu(false);
        setFocusMode(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette, closePalette]);

  useEffect(() => {
    if (!showPalette) return;
    setPaletteIndex(0);
  }, [showPalette]);

  useEffect(() => {
    if (composerBlock) return;
    setError((current) =>
      current === COMPOSER_ERROR.preparing || current === COMPOSER_ERROR.verify_account
        ? ""
        : current,
    );
  }, [composerBlock]);

  useEffect(
    () => () => {
      if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    },
    [],
  );

  async function runInlineKeyTest() {
    setTestingKey(true);
    setKeyTestStatus(null);
    const res = await testGeminiKeyRequest();
    setTestingKey(false);
    setKeyTestStatus({ ok: res.ok, text: res.ok ? res.message : res.error });
    if (res.ok) setError("");
  }

  async function sendMessage(value = input, regeneration?: { assistantId: string; history: ChatMessage[] }) {
    const content = value.trim();
    if (!content || sendingRef.current || pending) return;

    // Never drop a message silently. While identity is resolving the composer
    // stays typable, the draft is preserved, and this explains why Send waits.
    if (composerBlock) {
      setError(COMPOSER_ERROR[composerBlock]);
      fieldRef.current?.focus();
      return;
    }

    const apiKey = readApiKey();
    const token = bearerToken();

    // Guests are allowed to chat. This branch used to `router.replace("/login")`
    // whenever there was no bearer token, so pressing Send as a guest silently
    // threw away the message and dumped the user on the login screen — while
    // that screen advertised "Continue without an account" and ten free daily
    // questions. The server now meters guests itself (lib/guest-quota.ts), so
    // the client sends the request with no token and lets the server decide.
    //
    // Identity readiness is checked above through `composerBlock`, so a guest
    // request can never race an account token that is still resolving.

    const requestId = crypto.randomUUID();

    const conversationId = activeId ?? createConversation();
    const assistantModelLabel = `ANVIK · ${modeLabel(mode)}`;
    const current = useChatStore.getState().conversations.find((item) => item.id === conversationId);
    const userMessage: ChatMessage | null = regeneration
      ? null
      : { id: makeId(), role: "user", content, createdAt: Date.now() };
    const assistantId = regeneration?.assistantId ?? makeId();
    if (regeneration) {
      updateMessage(conversationId, assistantId, "");
      setMessageMeta(conversationId, assistantId, {
        source: "gemini",
        model: assistantModelLabel,
        verdict: undefined,
        isError: false,
        searchStatus: "off",
        sources: [],
        queries: [],
      });
    } else if (userMessage) {
      addMessage(conversationId, userMessage);
      addMessage(conversationId, { id: assistantId, role: "assistant", content: "", createdAt: Date.now() });
      setInput("");
    }
    sendingRef.current = true;
    setPending(true);
    setError("");
    setKeyTestStatus(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let answer = "";

    try {
      const historyMessages = regeneration?.history ?? [...(current?.messages ?? []), userMessage!];
      const history = historyMessages
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
        const issue = (await response.json().catch(() => null)) as { error?: string; detail?: string; code?: string } | null;

        // Only an expired/invalid SESSION signs the user out. A guest hitting
        // the daily allowance also gets a 401-shaped refusal in older builds,
        // and signing them out would be meaningless — they were never signed in.
        const sessionRejected =
          (response.status === 401 || response.status === 403) &&
          issue?.code !== "guest_limit_reached";
        if (sessionRejected) {
          await signOut();
          router.replace("/login");
          return;
        }

        // Out of guest questions: keep the message on screen and point at the
        // free account that lifts the limit, instead of a dead end.
        if (issue?.code === "guest_limit_reached") {
          throw new Error(
            "You've used today's free questions. Sign in for more — it's free, and your history follows you.",
          );
        }

        throw new Error(mapHttpErrorMessage(response.status, issue?.error ?? issue?.detail, issue?.code));
      }

      const isSSE = (response.headers.get("content-type") ?? "").includes("text/event-stream");

      // The done frame is authoritative. The header is only an advisory
      // promise set before the stream starts — never used to claim a verified
      // search.
      let finalSearchStatus: "on" | "off" | "unavailable" = "off";
      let finalSources: SearchSource[] = [];
      let finalQueries: string[] = [];
      let streamError = "";

      if (isSSE) {
        // Frame protocol: meta (first packet) -> tok(s) -> done (sources + queries).
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleFrame = (raw: string) => {
          const frame = raw.trim();
          if (!frame.startsWith("data:")) return;
          let parsed: { t?: string; s?: string; message?: string; model?: string; search?: string; sources?: Array<{ title?: string; uri?: string; domain?: string; provider?: string; snippet?: string }>; queries?: string[] };
          try {
            parsed = JSON.parse(frame.slice(5).trim());
          } catch {
            return;
          }
          if (parsed.t === "meta") {
            setMessageMeta(conversationId, assistantId, {
              source: "gemini",
              model: assistantModelLabel,
              searchStatus: parsed.search === "on" || parsed.search === "unavailable" ? parsed.search : "off",
            });
          } else if (parsed.t === "tok" && typeof parsed.s === "string" && parsed.s) {
            answer += parsed.s;
            updateMessage(conversationId, assistantId, answer);
          } else if (parsed.t === "err") {
            // A terminal frame from the server. Keep whatever text already
            // arrived and surface one friendly message instead of letting the
            // reader throw a raw network/stream error at the user.
            streamError =
              typeof parsed.message === "string" && parsed.message.trim()
                ? parsed.message.trim()
                : "ANVIK lost the connection before finishing. Please try again.";
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
                  ...(s.provider === "exa" || s.provider === "tavily" || s.provider === "google" ? {provider:s.provider} : {}),
                  ...(typeof s.snippet === "string" && s.snippet.trim() ? {snippet:s.snippet.trim().slice(0,1200)} : {}),
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

      if (streamError) {
        if (answer.trim()) {
          // Keep the partial answer the user already watched arrive; the
          // banner explains why it stopped.
          updateMessage(conversationId, assistantId, answer);
          setMessageMeta(conversationId, assistantId, {
            source: "gemini",
            model: assistantModelLabel,
            isError: true,
            searchStatus: finalSearchStatus,
            sources: finalSources,
            queries: finalQueries,
          });
        } else {
          updateMessage(conversationId, assistantId, streamError);
          setMessageMeta(conversationId, assistantId, { isError: true });
        }
        setError(streamError);
      } else if (!answer.trim()) {
        const emptyMsg = "ANVIK could not answer. Check key or try again.";
        updateMessage(conversationId, assistantId, emptyMsg);
        setMessageMeta(conversationId, assistantId, { isError: true });
        setError(emptyMsg);
      } else {
        updateMessage(conversationId, assistantId, answer);
        setMessageMeta(conversationId, assistantId, {
          source: "gemini",
          model: assistantModelLabel,
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
        if (answer.trim()) {
          updateMessage(conversationId, assistantId, answer);
          setMessageMeta(conversationId, assistantId, { isError: true });
        } else {
          updateMessage(conversationId, assistantId, message);
          setMessageMeta(conversationId, assistantId, { isError: true });
        }
        setError(message);
      }
    } finally {
      abortRef.current = null;
      sendingRef.current = false;
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

  async function shareMessage(message: ChatMessage) {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "ANVIK response", text: message.content });
        return;
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
      }
    }
    await copyMessage(message);
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

  function clearUndoTimer() {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }

  function removeConversation(chat: Conversation) {
    clearUndoTimer();
    deleteConversationWithUndo(chat.id);
    undoTimerRef.current = window.setTimeout(() => {
      clearDeletedConversations();
      undoTimerRef.current = null;
    }, 6000);
  }

  function undoRemove() {
    if (deletedConversations.length === 0) return;
    clearUndoTimer();
    undoDelete();
    // Give the next deletion in the stack its own full undo window.
    if (deletedConversations.length > 1) {
      undoTimerRef.current = window.setTimeout(() => {
        clearDeletedConversations();
        undoTimerRef.current = null;
      }, 6000);
    }
    setError("");
  }

  function dismissUndo() {
    clearUndoTimer();
    clearDeletedConversations();
  }

  const isEmptyInput = !input.trim();
  const canSend = canSendMessage(composerReadiness, input, pending);

  const renderChatbar = (options: { className: string; showTooltip?: boolean }) => (
    <form onSubmit={submit} className={options.className}>
      <div className="chatbar-shell relative">
        <ChatbarLight contentLength={input.length} active={chatFocused} streaming={pending} />
        <div className="chatbar relative z-[1]" data-typing={isEmptyInput ? "false" : "true"}>
        <motion.div className="chatbar-inner" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}>
          <div className="chatbar-prompt-row">
            <Link href="/settings" className="inline-flex items-center gap-1.5 mr-2 text-xs font-bold text-[#1A1A1A]" title="Switch provider">
              {(() => { const b = getProviderBadge(getActiveProviderId()); if (b.icon === "google-gemini") return "G"; if (b.icon === "openai") return "O"; if (b.icon === "anthropic") return "A"; return b.monogram; })()}
            </Link>
            <div className="chatbar-input-wrap">
              <textarea
                ref={fieldRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
            onFocus={() => setChatFocused(true)}
            onBlur={() => setChatFocused(false)}
                onKeyDown={keySubmit}
                aria-describedby="chat-composer-hint"
                placeholder="Ask ANVIK a question..."
                aria-label="Ask ANVIK a question..."
                rows={1}
                aria-busy={pending}
                className="chatbar-input"
              />
              <span id="chat-composer-hint" className="sr-only">Press Enter to send. Press Shift and Enter for a new line.</span>
            </div>
            <button
              type="submit"
              aria-label="Send message"
              disabled={!canSend}
              className="send-btn shrink-0"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <div className="chatbar-toolbar">
          <div ref={photoMenuRef} className="relative shrink-0">
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

          <DeepSearchToggle value={searchMode} onChange={setSearchMode} />

          <span className="hidden sm:inline shrink-0 text-xs font-medium text-[#999999]" aria-hidden="true">ANVIK 1.0</span>

          <ModelSelector value={mode} onChange={setMode} />

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

          </div>
          </motion.div>
        </div>
      </div>
      {composerBlock && hydrated && (
        <div
          role="status"
          className="mx-auto mt-2 flex max-w-[720px] flex-wrap items-center justify-center gap-2 rounded-xl border border-[#EDEDED] bg-[#F7F7F5] px-3 py-2 text-center text-xs text-[#666666]"
        >
          <span>{COMPOSER_NOTICE[composerBlock]}</span>
          {composerBlock === "verify_account" && (
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-[#EDEDED] bg-white px-2.5 py-1 font-medium text-[#1A1A1A] hover:border-[#1A1A1A]"
            >
              Retry connection
            </button>
          )}
        </div>
      )}
    </form>
  );

  const currentIdentity = profile?.id || "guest";
  const namespaceReady = hydrated && identityReady && !sessionLoading && !(session && !profile)
    && identityRef.current === currentIdentity;
  const safeConversations = useMemo(() => (namespaceReady ? conversations : []), [namespaceReady, conversations]);
  const activeMessages = useMemo(() => (namespaceReady ? (activeChat?.messages ?? []) : []), [namespaceReady, activeChat]);
  const filteredChats = useMemo(
    () => safeConversations.filter((chat) =>
      chat.title.toLowerCase().includes(search.toLowerCase()),
    ),
    [safeConversations, search],
  );
  const showConnectButton = error.includes("Connect your own key");
  const showKeyHelper = showConnectButton || /key invalid|invalid or expired/i.test(error);

  const welcomeGreeting = sessionLoading
    ? "Restoring your workspace…"
    : session && !profile
      ? "Your account is signed in"
      : profile
        ? `Hello, ${greetingFirstName(profile.name, profile.email)}`
        : "Hello, Guest";

  const quickStarts = [
    { label: "Generate code", icon: Code2, prompt: "Help me write a clean, accessible code solution for: " },
    { label: "Deep research", icon: Search, prompt: "Research this topic thoroughly, compare reliable sources, and cite the evidence: ", search: true },
    { label: "Build a landing page", icon: Sparkles, prompt: "Help me plan and build a polished, responsive landing page for: " },
    { label: "Explain a concept", icon: FileText, prompt: "Explain this concept clearly, step by step, with a simple example: " },
    { label: "Analyze an image", icon: ImageIcon, prompt: "Analyze the image I upload and explain what you can observe." },
  ];

  function chooseQuickStart(prompt: string, enableSearch = false) {
    setInput(prompt);
    if (enableSearch) setSearchMode("on");
    fieldRef.current?.focus();
  }

  const paletteActions: PaletteEntry[] = [
    {
      id: "palette-new-chat",
      label: "New chat",
      icon: MessageSquarePlus,
      run: () => {
        createConversation();
        setError("");
      },
    },
    { id: "palette-image-studio", label: "Image Studio", icon: ImageIcon, run: () => router.push("/image") },
    { id: "palette-vision-studio", label: "Vision Studio", icon: Eye, run: () => router.push("/vision") },
    { id: "palette-settings", label: "Settings", icon: KeyRound, run: () => router.push("/settings") },
  ];

  const paletteChatEntries: PaletteEntry[] = filterPaletteChats(safeConversations, paletteQuery).map(
    (chat) => ({
      id: `palette-chat-${chat.id}`,
      label: chat.title,
      icon: MessageSquarePlus,
      run: () => {
        setActive(chat.id);
        setError("");
      },
    }),
  );
  const paletteActionEntries = filterPaletteActions(paletteActions, paletteQuery);
  const paletteEntries: PaletteEntry[] = [...paletteChatEntries, ...paletteActionEntries];
  const paletteActiveIndex =
    paletteEntries.length === 0 ? -1 : Math.min(paletteIndex, paletteEntries.length - 1);

  function activatePaletteEntry(entry: PaletteEntry | undefined) {
    if (!entry) return;
    closePalette();
    entry.run();
  }

  function handlePaletteKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (paletteEntries.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setPaletteIndex((current) => wrapIndex(current, delta, paletteEntries.length));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      if (paletteEntries.length > 0) setPaletteIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      if (paletteEntries.length > 0) setPaletteIndex(paletteEntries.length - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activatePaletteEntry(paletteEntries[paletteActiveIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePalette({ restoreFocus: true });
    }
  }

  function renderPaletteEntry(entry: PaletteEntry, index: number) {
    const Icon = entry.icon;
    const selected = paletteActiveIndex === index;
    return (
      <button
        key={entry.id}
        id={entry.id}
        type="button"
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        onMouseEnter={() => setPaletteIndex(index)}
        onClick={() => activatePaletteEntry(entry)}
        className={"chat-item w-full " + (selected ? "is-active" : "")}
      >
        <Icon className="h-4 w-4 text-[#999999]" aria-hidden="true" />
        <span className="truncate">{entry.label}</span>
      </button>
    );
  }

  const undoableDeletion = deletedConversations[deletedConversations.length - 1];

  return (
    <div className="anvik-dark relative flex h-[100dvh] w-full overflow-hidden bg-white">
      {/* ==================== Sidebar ==================== */}
      {!focusMode && (
        <aside
          id="anvik-sidebar"
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
              <Link
                key={`${item.label}-${i}`}
                href={item.href}
                className={`chat-item ${item.label === "Chat" ? pathname === "/" || pathname === "/chat" ? "active" : "" : pathname.startsWith(item.href) ? "active" : ""}`}
                aria-current={item.label === "Chat" ? (pathname === "/" || pathname === "/chat" ? "page" : undefined) : pathname.startsWith(item.href) ? "page" : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0 text-[#999999]" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-4 flex items-center justify-between px-4 pb-1">
            <span className="text-xs font-medium text-[#999999]">Chats</span>
            <button
              type="button"
              aria-label="Focus chat filter"
              onClick={() => searchInputRef.current?.focus()}
              className="flex h-6 w-6 items-center justify-center rounded text-[#999999] hover:text-[#1A1A1A]"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>

          <label className="chat-search mx-3 mb-3 flex items-center gap-2 rounded-xl border border-[#EDEDED] bg-white px-3 py-2 focus-within:border-[#1A1A1A]">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#999999]" />
            <span className="sr-only">Search conversations</span>
            <input
              ref={searchInputRef}
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
                        onClick={(event) => {
                          deleteTriggerRef.current = event.currentTarget as HTMLButtonElement;
                          setDeleteTarget(chat);
                        }}
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
                {!sessionLoading && profile?.avatarUrl ? (
                  <Image src={profile.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
                ) : (
                  (!sessionLoading && profile?.name?.trim().charAt(0).toUpperCase()) || "G"
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1A1A1A]">
                {sessionLoading || (session && !profile) ? "Verifying account…" : profile?.name || "Guest"}
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
        <div className="anvik-topbar flex shrink-0 items-center justify-between gap-3 border-b border-[#EDEDED] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {!focusMode && (
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#666666] hover:bg-[#F7F7F5] md:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
                aria-expanded={sidebarOpen}
                aria-controls="anvik-sidebar"
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
            <div className="anvik-topbar-heading hidden sm:flex">
              <span className="anvik-topbar-eyebrow">ANVIK</span>
              <span className="anvik-topbar-title max-w-[220px] truncate">
                {activeMessages.length > 0 ? activeChat?.title || "Conversation" : "New conversation"}
              </span>
            </div>
          </div>

          <form
            role="search"
            className="anvik-searchbar"
            onSubmit={(event) => {
              event.preventDefault();
              openPalette(headerSearchRef.current, headerSearch);
              setHeaderSearch("");
            }}
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              ref={headerSearchRef}
              value={headerSearch}
              onChange={(event) => setHeaderSearch(event.target.value)}
              aria-label="Search chats and commands"
              placeholder="Search chats and commands…"
              autoComplete="off"
            />
            <kbd aria-hidden="true">Ctrl K</kbd>
          </form>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(event) => openPalette(event.currentTarget)}
              aria-label="Search conversations"
              className="anvik-search-mobile flex h-8 w-8 items-center justify-center rounded-lg text-[#666666] hover:bg-[#F7F7F5]"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setFocusMode((v) => !v)}
              aria-label="Toggle focus mode"
              aria-pressed={focusMode}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                focusMode ? "bg-[#1A1A1A] text-white" : "text-[#666666] hover:bg-[#F7F7F5]"
              }`}
            >
              {focusMode ? <PanelLeftClose className="h-4 w-4" /> : <Focus className="h-4 w-4" />}
            </button>
            {/* Notifications bell hidden until backend push notifications are added. */}
          </div>
        </div>

        {/* Screen-reader-only progress announcement; the visual state stays calm. */}
        <div className="sr-only" role="status" aria-live="polite">
          {pending ? "ANVIK is responding." : ""}
        </div>

        {/* Message area */}
        {activeMessages.length === 0 ? (
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto thin-scroll scroll-container">
            <div className="welcome-stage relative isolate flex min-h-[calc(100dvh-58px)] w-full flex-col items-center justify-center overflow-hidden px-4 py-12 text-center sm:px-6">
              <div className="welcome-stage-overlay" aria-hidden="true" />
              <div className="welcome-3d-object" aria-hidden="true">
                <span className="welcome-3d-core" />
                <span className="welcome-3d-ring welcome-3d-ring-primary" />
                <span className="welcome-3d-ring welcome-3d-ring-secondary" />
              </div>
              <div className="welcome-content relative z-10 mx-auto flex w-full max-w-[920px] flex-col items-center">
              <AnvikStar size="lg" className="mb-5" />
              <span className="welcome-eyebrow">
                <span className="h-1.5 w-1.5 rounded-full bg-[#D97757]" aria-hidden="true" />
                Your intelligence companion
              </span>
              <h1
                className="welcome-fade-in text-[clamp(2.6rem,7vw,5rem)] font-semibold leading-[1.02] tracking-[-0.065em] text-[#1A1A1A]"
                style={{ letterSpacing: "-0.065em" }}
              >
                ANVIK AI
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#666666] sm:text-base">
                <span className="font-semibold text-[#1A1A1A]">{welcomeGreeting}</span>
                {sessionLoading
                  ? " · Reconnecting securely. Your conversations will appear in a moment."
                  : session && !profile
                    ? " · Your secure session is active. Reconnect to restore your saved workspace."
                    : " · Build something amazing — just start typing below."}
              </p>

              {/* Glowing chatbar — welcome screen */}
              {renderChatbar({ className: "mt-10 w-full", showTooltip: true })}
              <div className="mt-7 flex w-full max-w-[920px] flex-wrap items-center justify-center gap-3" aria-label="Quick starts">
                {quickStarts.map(({ label, icon: Icon, prompt, search: enableSearch }) => (
                  <button key={label} type="button" onClick={() => chooseQuickStart(prompt, Boolean(enableSearch))} className="welcome-shortcut">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {error && (
                <div role="alert" aria-live="assertive" className="anvik-alert mt-6 max-w-md">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{error}</span>
                  {showConnectButton && (
                    <a href="/settings" className="anvik-alert-action">
                      Connect
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setError("")}
                    aria-label="Dismiss error"
                    className="anvik-alert-dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <Virtuoso
              ref={virtuosoRef}
              scrollerRef={(ref) => { scrollContainerRef.current = ref as HTMLDivElement | null; }}
              className="flex-1 thin-scroll scroll-container"
              data={activeMessages}
              computeItemKey={(_, message) => message.id}
              defaultItemHeight={120}
              increaseViewportBy={{ top: 200, bottom: 400 }}
              followOutput={() => (pending || atBottom) ? "smooth" : false}
              atBottomStateChange={(bottom) => {
                setAtBottom(bottom);
                setShowScrollPill(!bottom);
              }}
              atBottomThreshold={80}
              components={{
                List: VirtuosoList,
                Footer: () =>
                  pending && activeMessages[activeMessages.length - 1]?.content ? (
                    <div className="flex items-center gap-2 pl-1 text-xs text-[#999999]">
                      <span className="typing-dots" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  ) : null,
              }}
              itemContent={(index, message) => {
                const isUser = message.role === "user";
                const isLastAssistant = !isUser && index === activeMessages.length - 1;
                const isThinking = !isUser && !message.content && pending && isLastAssistant;
                const isStreaming = !isUser && pending && isLastAssistant && !!message.content;
                const previousUserMessage = !isUser
                  ? [...activeMessages.slice(0, index)].reverse().find((item) => item.role === "user")
                  : undefined;

                if (isUser) {
                  return (
                    <article key={message.id} className="user-message msg-enter mb-7">
                      <p className="whitespace-pre-wrap text-[15px] leading-[1.7] text-[#1A1A1A]">{message.content}</p>
                    </article>
                  );
                }

                return (
                  <article key={message.id} className="msg-row msg-enter mb-9">
                    {isThinking ? (
                      <div className="thinking-card" role="status" aria-live="polite">
                        <span className="thinking-orb" aria-hidden="true">
                          <AnvikStar size="sm" spin />
                        </span>
                        <div className="thinking-copy">
                          <span className="thinking-title">
                            {message.searchStatus === "on" ? "Searching the web" : "ANVIK is thinking"}
                          </span>
                          <span className="thinking-sub">
                            {message.searchStatus === "on"
                              ? "Checking live sources for a grounded answer…"
                              : "Composing a clear, careful answer…"}
                          </span>
                        </div>
                        <span className="typing-dots" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </div>
                    ) : message.isError ? (
                      <div className="anvik-alert max-w-[720px]">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        <span className="min-w-0 flex-1 whitespace-pre-wrap">{message.content}</span>
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

                        <div className="mt-1 text-xs text-[#999999]">{brandedModelLabel(message.model, mode)}</div>

                        {!isStreaming && message.searchStatus && message.searchStatus !== "off" && (
                          <SourcesPanel
                            sources={message.sources ?? []}
                            queries={message.queries ?? []}
                            searchStatus={message.searchStatus}
                            defaultOpen={(message.sources?.length ?? 0) > 0}
                          />
                        )}

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
                            aria-pressed={message.verdict === "like"}
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
                            aria-pressed={message.verdict === "dislike"}
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
                            aria-label="Regenerate last answer"
                            title="Regenerate last answer"
                            disabled={pending || !isLastAssistant || !previousUserMessage}
                            onClick={() => {
                              if (!previousUserMessage || !isLastAssistant) return;
                              void sendMessage(previousUserMessage.content, {
                                assistantId: message.id,
                                history: activeMessages.slice(0, index),
                              });
                            }}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#999999] hover:bg-[#F7F7F5] hover:text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Regenerate</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Share response"
                            onClick={() => void shareMessage(message)}
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
              }}
            />
            {showScrollPill && (
              <button
                type="button"
                onClick={scrollToBottom}
                className="fixed bottom-24 right-6 z-20 rounded-full bg-white px-3 py-1.5 text-xs shadow-md"
              >
                Scroll to bottom
              </button>
            )}
          </>
        )}

        {/* Bottom composer (when in conversation) */}
        {activeMessages.length > 0 && (
          <div className="composer-dock shrink-0 px-3 py-3 sm:px-6 sm:py-4">
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="anvik-alert mx-auto mb-3 max-w-[760px]"
              >
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <span className="min-w-0 flex-1">{error}</span>
                <div className="flex shrink-0 items-center gap-2">
                  {showKeyHelper && !showConnectButton && (
                    <button
                      type="button"
                      onClick={() => void runInlineKeyTest()}
                      disabled={testingKey}
                      className="anvik-alert-action"
                    >
                      {testingKey ? "Testing..." : "Test Key"}
                    </button>
                  )}
                  {showKeyHelper && (
                    <a href="/settings" className="anvik-alert-action">
                      {showConnectButton ? "Connect" : "Settings"}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setError("")}
                    aria-label="Dismiss error"
                    className="anvik-alert-dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {keyTestStatus && (
              <div
                role="status"
                className={`mx-auto mb-3 flex max-w-[760px] items-center gap-2 rounded-xl border px-3.5 py-2 text-xs ${
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

            {renderChatbar({ className: "mx-auto w-full max-w-[760px]" })}
          </div>
        )}
      </section>

      {deleteTarget && (
        <div
          ref={deleteDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-conversation-title"
          aria-describedby="delete-conversation-description"
          tabIndex={-1}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#EDEDED] bg-white p-5 shadow-2xl">
            <h2 id="delete-conversation-title" className="text-base font-semibold text-[#1A1A1A]">
              Delete this conversation?
            </h2>
            <p id="delete-conversation-description" className="mt-2 text-sm text-[#666666]">This action cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                ref={deleteCancelRef}
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-[#EDEDED] bg-white px-3 py-1.5 text-sm text-[#1A1A1A] hover:border-[#1A1A1A]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  removeConversation(deleteTarget);
                  setDeleteTarget(null);
                }}
                className="rounded-lg bg-[#1A1A1A] px-3 py-1.5 text-sm text-white hover:bg-[#333]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {undoableDeletion && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[90] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-[#30394d] bg-[#0d111b] px-4 py-3 text-sm text-slate-200 shadow-2xl"
        >
          <span className="min-w-0 truncate">Deleted “{undoableDeletion.conversation.title}”</span>
          <button
            type="button"
            onClick={undoRemove}
            className="shrink-0 font-semibold text-white underline underline-offset-2"
          >
            Undo
          </button>
          <button
            type="button"
            aria-label="Dismiss undo"
            onClick={dismissUndo}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-[#20283a] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ==================== Command Palette ==================== */}
      {showPalette && (
        <div
          className="palette-overlay fixed inset-0 z-[100] flex items-start justify-center bg-black/10 pt-[15vh] backdrop-blur-sm"
          onClick={() => closePalette()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="palette-panel w-full max-w-[560px] mx-4 rounded-2xl border border-[#EDEDED] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-[#EDEDED] px-4 py-3">
              <Search className="h-4 w-4 text-[#999999]" aria-hidden="true" />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls="anvik-command-list"
                aria-autocomplete="list"
                aria-activedescendant={
                  paletteActiveIndex >= 0 ? paletteEntries[paletteActiveIndex].id : undefined
                }
                aria-label="Search chats and commands"
                value={paletteQuery}
                onChange={(e) => {
                  setPaletteQuery(e.target.value);
                  setPaletteIndex(0);
                }}
                onKeyDown={handlePaletteKeyDown}
                placeholder="Search chats, pages, and commands..."
                className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#999999] focus:outline-none"
              />
              <kbd className="rounded border border-[#EDEDED] px-1.5 py-0.5 text-[10px] text-[#999999]">ESC</kbd>
            </div>
            <div
              id="anvik-command-list"
              role="listbox"
              aria-label="Chats and commands"
              className="max-h-[320px] overflow-y-auto p-2 thin-scroll"
            >
              {paletteChatEntries.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-medium text-[#999999]" role="presentation">Chats</div>
                  {paletteChatEntries.map((entry, index) => renderPaletteEntry(entry, index))}
                </>
              )}
              {paletteActionEntries.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-medium text-[#999999]" role="presentation">Actions</div>
                  {paletteActionEntries.map((entry, index) =>
                    renderPaletteEntry(entry, paletteChatEntries.length + index),
                  )}
                </>
              )}
              {paletteEntries.length === 0 && (
                <div role="status" className="px-3 py-8 text-center text-xs text-[#999999]">
                  No chats or commands match “{paletteQuery.trim()}”.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const MemoizedMessageItem = memo(function MemoizedMessageItem({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
});

export default function ChatWorkspace() {
  return (
    <ErrorBoundary title="Chat workspace hit an unexpected error">
      <ChatWorkspaceInner />
    </ErrorBoundary>
  );
}
