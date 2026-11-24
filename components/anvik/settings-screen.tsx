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

      {/* ANVIK Free Key */}
      <div className="surface-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#EDEDED] bg-[#F7F7F5] text-[#D97757]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A]">ANVIK Free Key (Automatic)</h2>
            <p className="text-xs text-[#666666]">
              The free key is provided automatically and requires no setup.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#EDEDED] bg-[#F7F7F5] px-3 py-2 text-xs text-[#666666]">
            {savedKey ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-[#1A1A1A]" />
                Active key: <code className="font-mono text-[#1A1A1A]">{maskKey(savedKey)}</code>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-[#999999]" />
                No free key detected — add your own below
              </>
            )}
          </span>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEDED] bg-white px-3.5 py-2 text-xs font-medium text-[#1A1A1A] hover:border-[#1A1A1A]"
          >
            Get Free Key <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Your Own Key */}
      <div className="surface-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#EDEDED] bg-[#F7F7F5] text-[#1A1A1A]">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A]">Your Own Key (Optional)</h2>
            <p className="text-xs text-[#666666]">
              Paste an ANVIK key to use your own quota. Saved only in this browser.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {savedKey && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#EDEDED] bg-[#F7F7F5] px-4 py-3 text-xs text-[#666666]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1A1A1A]" />
                <span>
                  Saved: <code className="font-mono text-[#1A1A1A]">{maskKey(savedKey)}</code>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleTestKey()}
                  disabled={testingKey}
                  className="rounded-lg border border-[#EDEDED] bg-white px-3 py-1.5 text-xs font-medium text-[#1A1A1A] hover:border-[#1A1A1A] disabled:opacity-40"
                >
                  {testingKey ? "Testing..." : "Test"}
                </button>
                <button
                  type="button"
                  onClick={removeKey}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#EDEDED] bg-white px-3 py-1.5 text-xs font-medium text-[#666666] hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          )}

          <form onSubmit={saveGeminiKey} className="flex flex-col gap-2.5 sm:flex-row">
            <div className="relative flex-1">
              <label className="sr-only" htmlFor="anvik-api-key">
                ANVIK API key
              </label>
              <input
                id="anvik-api-key"
                type={showKeyInput ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={geminiKey}
                onChange={(event) => setGeminiKey(event.target.value)}
                placeholder="Paste ANVIK Key"
                className="w-full rounded-xl border border-[#EDEDED] bg-white py-2.5 pr-10 pl-4 font-mono text-xs text-[#1A1A1A] placeholder:text-[#999999] focus:border-[#1A1A1A] focus:outline-none"
              />
              <button
                type="button"
                aria-label={showKeyInput ? "Hide key" : "Show key"}
                onClick={() => setShowKeyInput((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center px-2 text-[#999999] hover:text-[#1A1A1A]"
              >
                {showKeyInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!geminiKey.trim()}
                className="rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#333] disabled:opacity-30"
              >
                {keySaved ? "Saved!" : "Save"}
              </button>
              {!savedKey && (
                <button
                  type="button"
                  onClick={() => void handleTestKey()}
                  disabled={testingKey || !geminiKey.trim()}
                  className="rounded-xl border border-[#EDEDED] bg-white px-4 py-2.5 text-xs font-semibold text-[#1A1A1A] hover:border-[#1A1A1A] disabled:opacity-40"
                >
                  {testingKey ? "Testing..." : "Test"}
                </button>
              )}
            </div>
          </form>

          {keyError && (
            <p className="flex items-center gap-2 rounded-lg border border-[#EDEDED] bg-[#F7F7F5] px-3.5 py-2 text-xs text-[#666666]" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#999999]" />
              <span>{keyError}</span>
            </p>
          )}

          {testResult && (
            <p
              role="status"
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs ${
                testResult.ok
                  ? "border-[#EDEDED] bg-[#F7F7F5] text-[#1A1A1A]"
                  : "border-[#EDEDED] bg-[#F7F7F5] text-[#666666]"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1A1A1A]" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-[#999999]" />
              )}
              <span>{testResult.text}</span>
            </p>
          )}
        </div>
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
        {quota && (
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
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#F0F0EE]">
              <div
                className="h-full rounded-full bg-[#1A1A1A] transition-all"
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
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
