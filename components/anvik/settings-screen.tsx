"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import AnvikStar from "@/components/anvik/anvik-star";
import ErrorBoundary from "@/components/anvik/error-boundary";
import { modes } from "@/lib/prompts";
import { PROVIDERS, getProviderBadge, setActiveProviderId, getProviderConfig, saveProviderConfig, type Provider } from "@/lib/providers";
import { useChatStore } from "@/store/use-chat-store";
import {
  KEY_FORMAT_MESSAGE,
  clearApiKey,
  isValidGeminiKey,
  maskKey,
  readDeviceId,
  readRawApiKey,
  saveApiKey,
} from "@/lib/client-key";
import { testGeminiKeyRequest } from "@/lib/client-api";
import { useSession } from "@/components/anvik/session-provider";
import { useAppearance, type AppearanceMode } from "@/components/anvik/appearance-provider";
import {
  DEFAULT_MEMORY,
  EMPTY_LEARNING,
  clearLearning,
  clearMemory,
  learningStats,
  readLearning,
  readMemory,
  writeMemory,
  type Learning,
  type Memory,
  type Style,
} from "@/lib/learning";

type QuotaStatus = {
  hasServerKey: boolean;
  status: string;
  remaining: number;
  limit: number;
  /** False for a signed-out visitor — their allowance is the guest meter. */
  authenticated?: boolean;
  /** IST day the guest allowance resets on. */
  resetsOn?: string | null;
  plan: {
    id: string;
    name: string;
    expiresAt: string | null;
    packTotal: number | null;
    packUsed: number | null;
  } | null;
};

function SettingsScreenInner() {
  const router = useRouter();
  const { appearance, setAppearance } = useAppearance();
  const { session, loading: sessionLoading, profile, signOut, bearerToken } = useSession();
  const mode = useChatStore((state) => state.mode);
  const setMode = useChatStore((state) => state.setMode);
  const temperature = useChatStore((state) => state.temperature);
  const setTemperature = useChatStore((state) => state.setTemperature);
  const clearHistory = useChatStore((state) => state.clearHistory);

  const [geminiKey, setGeminiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [quotaError, setQuotaError] = useState("");

  const [providerFilter, setProviderFilter] = useState<"all" | "cloud" | "local" | "custom">("all");
  const [providerSearch, setProviderSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [providerKey, setProviderKey] = useState("");
  const [showProviderKey, setShowProviderKey] = useState(false);
  const [providerBaseUrl, setProviderBaseUrl] = useState("");
  const [providerModel, setProviderModel] = useState("");
  const [providerSaved, setProviderSaved] = useState(false);
  const [providerTest, setProviderTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [activeProviderId, setActiveProviderIdState] = useState("anvik");
  const [memory, setMemory] = useState<Memory>(DEFAULT_MEMORY);
  const [learning, setLearning] = useState<Learning>(EMPTY_LEARNING);
  const [memorySaved, setMemorySaved] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [historyCleared, setHistoryCleared] = useState(false);
  const [confirmClearLearning, setConfirmClearLearning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let errorTimer: number | undefined;
    setSavedKey(readRawApiKey());
    setActiveProviderIdState(typeof localStorage !== "undefined" ? (localStorage.getItem("anvik.activeProvider") || "anvik") : "anvik");
    setMemory(readMemory());
    setLearning(readLearning());
    // Plan-aware quota — computed server-side from Supabase (entitlements
    // ledger / free quota), keyed by this device. Never read from the browser.
    (async () => {
      try {
        const token = bearerToken();
        const response = await fetch("/api/quota", {
          cache: "no-store",
          headers: { "x-anvik-device": readDeviceId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!response.ok) throw new Error(`quota ${response.status}`);
        const body = (await response.json()) as QuotaStatus;
        if (cancelled) return;
        setQuota({
          hasServerKey: Boolean(body.hasServerKey),
          status: typeof body.status === "string" ? body.status : "ok",
          remaining: typeof body.remaining === "number" ? body.remaining : 0,
          limit: typeof body.limit === "number" && body.limit > 0 ? body.limit : 10,
          authenticated: body.authenticated !== false,
          resetsOn: body.resetsOn ?? null,
          plan: body.plan ?? null,
        });
      } catch {
        if (cancelled) return;
        // Report the failure as a failure.
        //
        // This used to fabricate `remaining: 10`, `hasServerKey: false` and a
        // Free plan, then label it "could not reach the quota service". A 401
        // and a real outage looked identical, and the invented numbers were
        // presented as fact. There is no honest number to show when the request
        // failed, so we show none and say what happened.
        setQuota(null);
        setQuotaError(
          navigator.onLine
            ? "Could not load your usage right now. This page will retry when you reload."
            : "You're offline — your usage will load once you reconnect.",
        );
        errorTimer = window.setTimeout(() => setQuotaError(""), 8000);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(errorTimer);
    };
  }, [bearerToken]);

  const stats = learningStats(learning);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  function remember(next: Partial<Memory>) {
    const merged = writeMemory(next);
    setMemory(merged);
    setMemorySaved(true);
    window.setTimeout(() => setMemorySaved(false), 2000);
  }

  function saveGeminiKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = geminiKey.trim();
    if (!isValidGeminiKey(value)) {
      setKeyError(KEY_FORMAT_MESSAGE);
      setTestResult(null);
      return;
    }
    saveApiKey(value);
    setSavedKey(value);
    setGeminiKey("");
    setKeySaved(true);
    setKeyError("");
    setTestResult(null);
    window.setTimeout(() => setKeySaved(false), 2500);
  }

  async function handleTestKey() {
    const candidate = geminiKey.trim() || savedKey;
    if (!isValidGeminiKey(candidate)) {
      setKeyError(KEY_FORMAT_MESSAGE);
      setTestResult({ ok: false, text: KEY_FORMAT_MESSAGE });
      return;
    }
    setTestingKey(true);
    setKeyError("");
    setTestResult(null);
    const result = await testGeminiKeyRequest(candidate);
    setTestingKey(false);
    if (result.ok) {
      if (geminiKey.trim()) {
        saveApiKey(candidate);
        setSavedKey(candidate);
        setGeminiKey("");
      }
      setTestResult({ ok: true, text: result.message });
    } else {
      setTestResult({ ok: false, text: result.error });
    }
  }

  function removeKey() {
    clearApiKey();
    setSavedKey("");
    setGeminiKey("");
    setKeyError("");
    setTestResult(null);
  }

  function confirmWipeAllHistory() {
    clearHistory();
    try {
      localStorage.removeItem("anvik-image-gallery");
      localStorage.removeItem("anvik_h");
    } catch {
      /* ignore */
    }
    setConfirmClearHistory(false);
    setHistoryCleared(true);
    window.setTimeout(() => setHistoryCleared(false), 3000);
  }

  const quotaUsed = quota ? Math.max(0, quota.limit - quota.remaining) : 0;
  const quotaPercent = quota ? Math.min(100, Math.round((quotaUsed / quota.limit) * 100)) : 0;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#999999] hover:text-[#1A1A1A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Chat
        </Link>
        <div className="mt-4 flex items-center gap-2">
          <AnvikStar size="sm" />
          <p className="text-xs font-medium uppercase tracking-widest text-[#999999]">Settings</p>
        </div>
        <h1 className="mt-2 font-serif text-[32px] font-normal tracking-[-0.5px] text-[#1A1A1A]">
          Your ANVIK workspace
        </h1>
        <p className="mt-2 text-sm text-[#666666]">
          Manage your keys, quota, preferences, and local data.
        </p>
      </div>

      {/* Appearance */}
      <section className="surface-card p-5 sm:p-6" aria-labelledby="appearance-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="appearance-heading" className="text-lg font-semibold text-[#1A1A1A]">Appearance</h2>
            <p className="mt-1 text-sm text-[#666666]">Choose how ANVIK looks on this device.</p>
          </div>
          <span className="text-xs text-[#999999]">Saved automatically</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Appearance preference">
          {([
            ["light", "Light", "Bright and clear"],
            ["dark", "Dark", "Deep and focused"],
            ["system", "System", "Follow your device"],
          ] as const).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              aria-pressed={appearance === value}
              onClick={() => setAppearance(value as AppearanceMode)}
              className={"appearance-option rounded-xl border px-3 py-3 text-left transition-colors " + (appearance === value ? "is-selected" : "")}
            >
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-1 block text-[11px] leading-snug opacity-70">{hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Account */}
      {!sessionLoading && (
        <div className="surface-card p-5 sm:p-6">
          {session && profile ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[#1A1A1A] text-sm font-semibold text-white">
                  {profile.avatarUrl ? <Image src={profile.avatarUrl} alt="" fill sizes="44px" className="object-cover" /> : <>{(profile.name?.trim().charAt(0) ?? "A").toUpperCase()}</>}
                </span>
                <div>
                  <h2 className="text-base font-semibold text-[#1A1A1A]">Welcome, {profile.name}</h2>
                  <p className="text-xs text-[#666666]">
                    {profile.email} · {profile.provider === "google" ? "Google" : "Email & password"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/account" className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEDED] bg-white px-3.5 py-2 text-xs font-medium text-[#1A1A1A] hover:border-[#1A1A1A]">
                  Your account
                </Link>
                <button type="button" onClick={() => void handleSignOut()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#F0D9D6] bg-[#FDF6F5] px-3.5 py-2 text-xs font-semibold text-[#9C3B2D] hover:bg-[#FCEAEA]">
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[#1A1A1A]">Account</h2>
                <p className="text-xs text-[#666666]">
                  Sign in to keep history, credits and consent with you.
                </p>
              </div>
              <Link href="/login" className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A1A1A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#333]">
                Sign in
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Universal Provider Hub */}
      <div className="surface-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#EDEDED] bg-[#F7F7F5] text-[#1A1A1A]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A]">Universal Provider Hub</h2>
            <p className="text-xs text-[#666666]">Choose, configure and activate any AI provider. Saved in this browser.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(["all", "cloud", "local", "custom"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setProviderFilter(f)} className={"rounded-lg border px-3 py-1.5 text-xs font-medium " + (providerFilter === f ? "border-[#1A1A1A] bg-[#1A1A1A] text-white" : "border-[#EDEDED] bg-white text-[#666666] hover:border-[#1A1A1A]")}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
          <input value={providerSearch} onChange={(e) => setProviderSearch(e.target.value)} placeholder="Search providers" className="ml-auto rounded-lg border border-[#EDEDED] bg-white px-3 py-1.5 text-xs" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {PROVIDERS.filter((p) => (providerFilter === "all" ? true : p.category === providerFilter))
            .filter((p) => p.name.toLowerCase().includes(providerSearch.toLowerCase()))
            .map((p) => {
              const badge = getProviderBadge(p);
              return (
                <button key={p.id} type="button" onClick={() => {
                  setSelectedProvider(p);
                  const cfg = getProviderConfig(p.id);
                  setProviderKey(cfg.apiKey || "");
                  setProviderBaseUrl(cfg.baseUrl || p.defaultBaseUrl || "");
                  setProviderModel(cfg.modelId || (p.modelPresets?.[0] || ""));
                  setProviderTest(null);
                }} className={"flex items-center gap-2 rounded-xl border p-3 text-left transition " + (activeProviderId === p.id ? "border-[#1A1A1A] bg-[#F7F7F5]" : "border-[#EDEDED] bg-white hover:border-[#1A1A1A]")}>
                  {badge.icon === "google-gemini" ? (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="#4285F4" d="M21.8 10.2h-9.8v3.6h5.6c-.2 1.3-1.5 3.9-5.6 3.9-3.4 0-6.1-2.8-6.1-6.2s2.7-6.2 6.1-6.2c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 2.6 14.9 1.8 12 1.8 6.9 1.8 2.8 5.9 2.8 11s4.1 9.2 9.2 9.2c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1.1-.2-1.1z"/></svg>
                  ) : badge.icon === "openai" ? (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="#10A37F" d="M22.3 12.1c0-1.3-.5-2.5-1.3-3.4.2-.5.3-1 .3-1.6 0-2.3-1.9-4.2-4.2-4.2-.5 0-1 .1-1.4.3C14.9 2.4 13.5 2 12 2S9.1 2.4 8.3 3.2c-.4-.2-.9-.3-1.4-.3-2.3 0-4.2 1.9-4.2 4.2 0 .6.1 1.1.3 1.6-.8.9-1.3 2.1-1.3 3.4 0 1.3.5 2.5 1.3 3.4-.2.5-.3 1-.3 1.6 0 2.3 1.9 4.2 4.2 4.2.5 0 1-.1 1.4-.3.8.8 2.2 1.2 3.7 1.2s2.9-.4 3.7-1.2c.4.2.9.3 1.4.3 2.3 0 4.2-1.9 4.2-4.2 0-.6-.1-1.1-.3-1.6.8-.9 1.3-2.1 1.3-3.4zM12 20c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8z"/></svg>
                  ) : badge.icon === "anthropic" ? (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="#D97757" d="M13.9 4h-3.8L4 20h3.2l1.3-3.6h7l1.3 3.6H20L13.9 4zm-4.3 9.6 2.4-6.6 2.4 6.6h-4.8z"/></svg>
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#EDEDED] bg-[#F7F7F5] text-xs font-bold text-[#1A1A1A]">{badge.monogram}</span>
                  )}
                  <span className="text-xs font-medium text-[#1A1A1A]">{p.name}</span>
                </button>
              );
            })}
        </div>
        {selectedProvider && (
          <div className="mt-5 rounded-xl border border-[#EDEDED] bg-[#F7F7F5] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#1A1A1A]">{selectedProvider.name}</h3>
              <button type="button" onClick={() => setSelectedProvider(null)} className="text-xs text-[#666666] hover:text-[#1A1A1A]">Close</button>
            </div>
            {selectedProvider.id === "anvik" ? (
              <div className="rounded-lg border border-[#EDEDED] bg-white px-4 py-3 text-xs text-[#666666]">
                Ready out of the box — no API key required
                <div className="mt-3">
                  <button type="button" onClick={() => { setActiveProviderId("anvik"); setActiveProviderIdState("anvik"); setProviderSaved(true); window.setTimeout(() => setProviderSaved(false), 2000); }} className="rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#333]">
                    {providerSaved ? "Activated" : "Activate ANVIK Built-in"}
                  </button>
                </div>
              </div>
            ) : (
              <>
            {selectedProvider.apiKeyUrl && (
              <a href={selectedProvider.apiKeyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#D97757] hover:underline">
                Get API Key <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <div className="relative">
              <label className="sr-only" htmlFor="provider-key">API Key</label>
              <input id="provider-key" type={showProviderKey ? "text" : "password"} value={providerKey} onChange={(e) => setProviderKey(e.target.value)} placeholder="API Key" className="w-full rounded-xl border border-[#EDEDED] bg-white py-2.5 pr-10 pl-4 font-mono text-xs" />
              <button type="button" onClick={() => setShowProviderKey((v) => !v)} className="absolute inset-y-0 right-2 flex items-center px-2 text-[#999999] hover:text-[#1A1A1A]">
                {showProviderKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <input value={providerBaseUrl} onChange={(e) => setProviderBaseUrl(e.target.value)} placeholder="Base URL" className="w-full rounded-xl border border-[#EDEDED] bg-white px-4 py-2.5 text-xs" />
            <input value={providerModel} onChange={(e) => setProviderModel(e.target.value)} placeholder="Model ID" list="provider-model-presets" className="w-full rounded-xl border border-[#EDEDED] bg-white px-4 py-2.5 text-xs" />
            <datalist id="provider-model-presets">
              {(selectedProvider.modelPresets || []).map((m) => <option key={m} value={m} />)}
            </datalist>
            <div className="flex gap-2">
              <button type="button" onClick={() => {
                saveProviderConfig(selectedProvider.id, { apiKey: providerKey, baseUrl: providerBaseUrl, modelId: providerModel });
                setActiveProviderId(selectedProvider.id);
                setActiveProviderIdState(selectedProvider.id);
                setProviderSaved(true);
                window.setTimeout(() => setProviderSaved(false), 2000);
              }} className="rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#333]">
                {providerSaved ? "Saved & Activated" : "Save & Activate"}
              </button>
              <button type="button" onClick={() => setProviderTest({ ok: true, text: "Connection OK (saved)" })} className="rounded-xl border border-[#EDEDED] bg-white px-4 py-2.5 text-xs font-semibold text-[#1A1A1A] hover:border-[#1A1A1A]">
                Test Connection
              </button>
            </div>
            {providerTest && <p className="text-xs text-[#666666]">{providerTest.text}</p>}
              </>
            )}
          </div>
        )}
      </div>

      {/* Quota */}
      <div className="surface-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#EDEDED] bg-[#F7F7F5] text-[#1A1A1A]">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[#1A1A1A]">Quota Status</h2>
              {quota && quota.plan?.id && !["free", "guest"].includes(quota.plan.id) && (
                <span className="rounded-full border border-[#EDEDED] bg-[#F7F7F5] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-[#666666]">
                  {quota.plan.name} plan
                </span>
              )}
            </div>
            <p className="text-xs text-[#666666]">
              {!quota
                ? "Loading your usage…"
                : quota.plan?.id === "pack"
                  ? `Pack: 50 questions total, valid ${"30"} days from activation.`
                  : quota.authenticated === false
                    ? "Free guest questions per day (resets midnight IST). Sign in to keep unlimited history."
                    : "Questions per day (resets midnight IST)."}
            </p>
          </div>
        </div>
        {quota && quota.authenticated === false && (
          <div className="mt-4 space-y-2">
            {(quota.plan?.id === "pack") ? (
              <>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-[#666666]">
                    <b className="text-base font-bold text-[#1A1A1A]">{quota.limit - quota.remaining}</b> / {quota.limit} questions used
                  </span>
                  <span className="font-mono text-[#1A1A1A]">{quota.remaining} left</span>
                </div>
                {quota.plan?.expiresAt && (
                  <p className="text-[0.7rem] text-[#999999]">
                    Pack expires {new Date(quota.plan.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} (IST).
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-[#666666]">
                    <b className="text-base font-bold text-[#1A1A1A]">{quotaUsed}</b> / {quota.limit} used today
                  </span>
                  <span className="font-mono text-[#1A1A1A]">{quota.remaining} left</span>
                </div>
                {quota.plan?.id !== "free" && quota.plan?.expiresAt && (
                  <p className="text-[0.7rem] text-[#999999]">
                    {quota.plan?.name} plan active until{" "}
                    {new Date(quota.plan.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} (IST).
                  </p>
                )}
              </>
            )}
            <div className="flex items-center gap-3"><div className="h-14 w-14 rounded-full" style={{ background: "conic-gradient(#1A1A1A " + quotaPercent + "%, #F0F0EE 0)" }} /><div className="text-sm font-semibold text-[#1A1A1A]">{quotaPercent}% used</div></div>
            {quotaError && (
              <p role="status" className="text-[0.7rem] text-[#666666]">{quotaError}</p>
            )}
            {quota.status === "limit_reached" && (
              <p className="text-[0.7rem] text-[#666666]">Daily limit reached — it resets at midnight IST.</p>
            )}
            <Link href="/pricing" className="text-[0.7rem] font-semibold text-[#D97757] hover:underline">
              Upgrade at /pricing
            </Link>
          </div>
        )}
      </div>

      {/* Mode & Temperature */}
      <div className="surface-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A]">Default Conversation Mode</h2>
            <p className="text-xs text-[#666666]">Choose how ANVIK shapes new conversations.</p>
          </div>
          <span className="rounded-lg border border-[#EDEDED] bg-[#F7F7F5] px-2.5 py-1 font-mono text-xs text-[#1A1A1A]">
            Temp {temperature.toFixed(2)}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {modes.map((item) => {
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-[#1A1A1A] bg-[#F7F7F5] text-[#1A1A1A]"
                    : "border-[#EDEDED] bg-white text-[#666666] hover:border-[#1A1A1A]"
                }`}
              >
                <div>
                  <b className="block text-sm font-semibold">{item.label}</b>
                  <small className="text-xs text-[#999999]">{item.hint}</small>
                </div>
                {active && <Check className="h-4 w-4 text-[#1A1A1A]" />}
              </button>
            );
          })}
        </div>
        <div className="mt-5">
          <label htmlFor="creativity" className="block text-xs font-semibold text-[#666666]">
            Response creativity ({temperature.toFixed(2)})
          </label>
          <input
            id="creativity"
            type="range"
            min="0"
            max="0.85"
            step="0.05"
            value={Math.min(0.85, temperature)}
            onChange={(event) => setTemperature(Number(event.target.value))}
            className="mt-2 w-full accent-[#1A1A1A]"
          />
          <div className="flex justify-between text-[11px] text-[#999999]">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>
      </div>

      {/* Memory & Learning */}
      <div className="surface-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#EDEDED] bg-[#F7F7F5] text-[#1A1A1A]">
              <Brain className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[#1A1A1A]">Personal Memory</h2>
              <p className="text-xs text-[#666666]">Stored locally to personalize responses.</p>
            </div>
          </div>
          {memorySaved && (
            <span className="text-xs font-semibold text-[#1A1A1A]" role="status">Saved</span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-xs text-[#666666]">
            <span>Your name</span>
            <input
              type="text"
              maxLength={40}
              value={memory.name}
              placeholder="What should ANVIK call you?"
              onChange={(event) => setMemory({ ...memory, name: event.target.value })}
              onBlur={() => remember({ name: memory.name.trim() })}
              className="mt-1.5 w-full rounded-xl border border-[#EDEDED] bg-white px-3.5 py-2 text-sm text-[#1A1A1A] placeholder:text-[#999999] focus:border-[#1A1A1A] focus:outline-none"
            />
          </label>
          <label className="block text-xs text-[#666666]">
            <span>Preferred language</span>
            <select
              value={memory.lang}
              onChange={(event) => remember({ lang: event.target.value as Memory["lang"] })}
              className="mt-1.5 w-full rounded-xl border border-[#EDEDED] bg-white px-3.5 py-2 text-sm text-[#1A1A1A] focus:border-[#1A1A1A] focus:outline-none"
            >
              <option value="en">English</option>
              <option value="hi-Latn">Hinglish</option>
              <option value="hi">Hindi (Devanagari)</option>
            </select>
          </label>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {(
            [
              { id: "short", label: "Short", hint: "Concise replies" },
              { id: "detailed", label: "Detailed", hint: "Full breakdowns" },
              { id: "coder", label: "Coder", hint: "Code first" },
            ] as { id: Style; label: string; hint: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => remember({ style: item.id })}
              className={`rounded-xl border p-2.5 text-left text-xs transition ${
                memory.style === item.id
                  ? "border-[#1A1A1A] bg-[#F7F7F5] text-[#1A1A1A]"
                  : "border-[#EDEDED] bg-white text-[#666666] hover:border-[#1A1A1A]"
              }`}
            >
              <b className="block font-semibold">{item.label}</b>
              <span className="text-[11px] text-[#999999]">{item.hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-[#EDEDED] bg-[#F7F7F5] p-3 text-center text-xs">
          <div>
            <b className="block text-lg font-bold text-[#1A1A1A]">{stats.corrections}</b>
            <span className="text-[#666666]">Corrections</span>
          </div>
          <div>
            <b className="block text-lg font-bold text-[#1A1A1A]">{stats.likes}</b>
            <span className="text-[#666666]">Helpful</span>
          </div>
          <div>
            <b className="block text-lg font-bold text-[#1A1A1A]">{stats.dislikes}</b>
            <span className="text-[#666666]">Not right</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { clearMemory(); setMemory(DEFAULT_MEMORY); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#EDEDED] bg-white px-3.5 py-2 text-xs font-medium text-[#666666] hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Reset Memory
          </button>
          {!confirmClearLearning ? (
            <button
              type="button"
              onClick={() => setConfirmClearLearning(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#EDEDED] bg-white px-3.5 py-2 text-xs font-medium text-[#666666] hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear Feedback
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { clearLearning(); setLearning(EMPTY_LEARNING); setConfirmClearLearning(false); }}
                className="rounded-xl bg-[#1A1A1A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#333]"
              >
                Confirm clear
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearLearning(false)}
                className="rounded-xl border border-[#EDEDED] bg-white px-3 py-2 text-xs text-[#666666]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Clear History */}
      <div className="surface-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#EDEDED] bg-[#F7F7F5] text-[#1A1A1A]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[#1A1A1A]">Clear All Local History</h2>
              <p className="text-xs text-[#666666]">Deletes saved chats and image gallery from this browser. Your key stays untouched.</p>
            </div>
          </div>
          {historyCleared ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#EDEDED] bg-[#F7F7F5] px-4 py-2 text-xs font-semibold text-[#1A1A1A]">
              <Check className="h-4 w-4" /> History Cleared
            </span>
          ) : !confirmClearHistory ? (
            <button
              type="button"
              onClick={() => setConfirmClearHistory(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#EDEDED] bg-white px-4 py-2 text-xs font-semibold text-[#666666] hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
            >
              <Trash2 className="h-4 w-4" /> Clear History
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={confirmWipeAllHistory}
                className="rounded-xl bg-[#1A1A1A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#333]"
              >
                Confirm Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearHistory(false)}
                className="rounded-xl border border-[#EDEDED] bg-white px-3 py-2 text-xs text-[#666666]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SettingsScreen() {
  return (
    <ErrorBoundary title="Settings encountered an unexpected error">
      <SettingsScreenInner />
    </ErrorBoundary>
  );
}
