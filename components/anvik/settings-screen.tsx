"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  Moon,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import TiltCard from "@/components/anvik/tilt-card";
import ErrorBoundary from "@/components/anvik/error-boundary";
import { modes } from "@/lib/prompts";
import { useChatStore } from "@/store/use-chat-store";
import {
  KEY_FORMAT_MESSAGE,
  clearApiKey,
  isValidGeminiKey,
  maskKey,
  readDailyQuota,
  readRawApiKey,
  saveApiKey,
  type DailyQuota,
} from "@/lib/client-key";
import { testGeminiKeyRequest } from "@/lib/client-api";
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

function SettingsScreenInner() {
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
  const [quota, setQuota] = useState<DailyQuota | null>(null);

  const [memory, setMemory] = useState<Memory>(DEFAULT_MEMORY);
  const [learning, setLearning] = useState<Learning>(EMPTY_LEARNING);
  const [memorySaved, setMemorySaved] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [historyCleared, setHistoryCleared] = useState(false);
  const [confirmClearLearning, setConfirmClearLearning] = useState(false);

  useEffect(() => {
    setSavedKey(readRawApiKey());
    setMemory(readMemory());
    setLearning(readLearning());
    setQuota(readDailyQuota());
  }, []);

  const stats = learningStats(learning);

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

  const quotaPercent = quota ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Chat
        </Link>
        <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#22D3EE]">
          <Sparkles className="h-3.5 w-3.5" /> Settings
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Control your{" "}
          <span className="gradient-text">Gemini workspace.</span>
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Add and verify your Google AI Studio key, check your daily quota, and manage local data.
        </p>
      </div>

      {/* Gemini API Key */}
      <TiltCard className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#7C3AED]/20 text-[#22D3EE]">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-white">Gemini API Key</h2>
            <p className="text-xs text-slate-400">
              Saved only in this browser&apos;s localStorage and sent with your Chat, Image, Code, Voice, and Vision requests.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {savedKey ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>
                  Saved key: <code className="font-mono text-white">{maskKey(savedKey)}</code>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleTestKey()}
                  disabled={testingKey}
                  className="btn-gradient rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white"
                >
                  {testingKey ? "Testing..." : "Test Key"}
                </button>
                <button
                  type="button"
                  onClick={removeKey}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-rose-500/20 hover:text-rose-200"
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          ) : null}

          <form onSubmit={saveGeminiKey} className="flex flex-col gap-2.5 sm:flex-row">
            <div className="relative flex-1">
              <label className="sr-only" htmlFor="gemini-api-key">
                Gemini API key
              </label>
              <input
                id="gemini-api-key"
                type={showKeyInput ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={geminiKey}
                onChange={(event) => setGeminiKey(event.target.value)}
                placeholder={savedKey ? "Paste a new key (starts with AIza...)" : "Paste Gemini key (AIza...)"}
                className="w-full rounded-xl border border-white/15 bg-[#050508]/80 py-2.5 pr-10 pl-4 font-mono text-xs text-white placeholder:text-slate-500 focus:border-[#22D3EE] focus:outline-none"
              />
              <button
                type="button"
                aria-label={showKeyInput ? "Hide key" : "Show key"}
                onClick={() => setShowKeyInput((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center px-2 text-slate-400 hover:text-white"
              >
                {showKeyInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!geminiKey.trim()}
                className="btn-gradient rounded-xl px-4 py-2.5 text-xs font-semibold text-white"
              >
                {keySaved ? "Saved!" : "Save Key"}
              </button>
              {!savedKey && (
                <button
                  type="button"
                  onClick={() => void handleTestKey()}
                  disabled={testingKey || !geminiKey.trim()}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-45"
                >
                  {testingKey ? "Testing..." : "Test Key"}
                </button>
              )}
            </div>
          </form>

          {keyError && (
            <p className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-200" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{keyError}</span>
            </p>
          )}

          {testResult && (
            <p
              role="status"
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs ${
                testResult.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-200"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              )}
              <span>{testResult.text}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-400">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[#22D3EE] hover:underline"
            >
              Get a free Gemini key at Google AI Studio <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <span>Format: starts with AIza, 35+ characters</span>
          </div>
        </div>
      </TiltCard>

      {/* Quota & Theme Status */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <TiltCard className="glass-card rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#22D3EE]/15 text-[#22D3EE]">
              <Gauge className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white">Quota Status</h2>
              <p className="text-xs text-slate-400">
                Daily request tracker on this device (resets midnight IST).
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-300">
                <b className="text-base font-bold text-white">{quota?.used ?? 0}</b> / {quota?.limit ?? 100} used today
              </span>
              <span className="font-mono text-[#22D3EE]">{quota?.remaining ?? 100} left</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#22D3EE] transition-all"
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Active model fallback: <code className="text-slate-200">{quota?.lastModel ?? "gemini-2.0-flash"}</code> → 2.5-flash → 1.5-flash
            </p>
          </div>
        </TiltCard>

        <TiltCard className="glass-card rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#7C3AED]/20 text-violet-300">
              <Moon className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-white">Appearance</h2>
                <span className="rounded-md border border-[#7C3AED]/40 bg-[#7C3AED]/20 px-2 py-0.5 text-[11px] font-semibold text-violet-200">
                  Dark Mode Locked On
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Deep black <code className="text-slate-200">#050508</code> canvas with frosted glass surfaces is permanently enabled to eliminate bright flashes.
              </p>
            </div>
          </div>
        </TiltCard>
      </div>

      {/* Mode & Temperature */}
      <TiltCard className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Default Conversation Mode</h2>
            <p className="text-xs text-slate-400">Choose how Gemini shapes new conversations.</p>
          </div>
          <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-[#22D3EE]">
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
                    ? "border-[#22D3EE]/60 bg-gradient-to-r from-[#7C3AED]/25 to-[#22D3EE]/15 text-white"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
                }`}
              >
                <div>
                  <b className="block text-sm font-semibold">{item.label}</b>
                  <small className="text-xs text-slate-400">{item.hint}</small>
                </div>
                {active && <Check className="h-4 w-4 text-[#22D3EE]" />}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <label htmlFor="creativity" className="block text-xs font-semibold text-slate-300">
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
            className="mt-2 w-full accent-[#22D3EE]"
          />
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>
      </TiltCard>

      {/* Memory & Learning */}
      <TiltCard className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#7C3AED]/20 text-[#22D3EE]">
              <Brain className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white">Personal Memory &amp; Learning</h2>
              <p className="text-xs text-slate-400">Stored locally on this device to personalize Gemini responses.</p>
            </div>
          </div>
          {memorySaved && (
            <span className="text-xs font-semibold text-emerald-400" role="status">
              Saved
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-xs text-slate-300">
            <span>Your name</span>
            <input
              type="text"
              maxLength={40}
              value={memory.name}
              placeholder="What should ANVIK call you?"
              onChange={(event) => setMemory({ ...memory, name: event.target.value })}
              onBlur={() => remember({ name: memory.name.trim() })}
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#050508]/70 px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-[#22D3EE] focus:outline-none"
            />
          </label>

          <label className="block text-xs text-slate-300">
            <span>Preferred language</span>
            <select
              value={memory.lang}
              onChange={(event) => remember({ lang: event.target.value as Memory["lang"] })}
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#0a0a14] px-3.5 py-2 text-sm text-white focus:border-[#22D3EE] focus:outline-none"
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
                  ? "border-[#22D3EE]/60 bg-[#22D3EE]/15 text-white"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
              }`}
            >
              <b className="block font-semibold">{item.label}</b>
              <span className="text-[11px] text-slate-400">{item.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-white/10 bg-[#050508]/60 p-3 text-center text-xs">
          <div>
            <b className="block text-lg font-bold text-white">{stats.corrections}</b>
            <span className="text-slate-400">Corrections</span>
          </div>
          <div>
            <b className="block text-lg font-bold text-white">{stats.likes}</b>
            <span className="text-slate-400">Helpful</span>
          </div>
          <div>
            <b className="block text-lg font-bold text-white">{stats.dislikes}</b>
            <span className="text-slate-400">Not right</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              clearMemory();
              setMemory(DEFAULT_MEMORY);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Reset Memory
          </button>

          {!confirmClearLearning ? (
            <button
              type="button"
              onClick={() => setConfirmClearLearning(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear Feedback
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  clearLearning();
                  setLearning(EMPTY_LEARNING);
                  setConfirmClearLearning(false);
                }}
                className="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-500"
              >
                Confirm clear feedback
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearLearning(false)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-300"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </TiltCard>

      {/* Danger Zone: Clear History */}
      <TiltCard className="glass-card rounded-2xl border-rose-500/25 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white">Clear All Local History</h2>
              <p className="text-xs text-slate-400">
                Deletes saved chats and generated image gallery from this browser (your API key stays untouched).
              </p>
            </div>
          </div>

          {historyCleared ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-200">
              <Check className="h-4 w-4" /> History Cleared
            </span>
          ) : !confirmClearHistory ? (
            <button
              type="button"
              onClick={() => setConfirmClearHistory(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25"
            >
              <Trash2 className="h-4 w-4" /> Clear History
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={confirmWipeAllHistory}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
              >
                Confirm Delete All
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearHistory(false)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-300"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </TiltCard>
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
