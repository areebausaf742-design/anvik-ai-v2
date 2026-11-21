"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AlertCircle,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  ImagePlus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import Markdown from "@/components/anvik/markdown";
import TiltCard from "@/components/anvik/tilt-card";
import ErrorBoundary from "@/components/anvik/error-boundary";
import { KEY_FORMAT_MESSAGE, readDeviceId, recordDailyUsage } from "@/lib/client-key";
import {
  mapClientFetchError,
  mapHttpErrorMessage,
  testGeminiKeyRequest,
  validateStoredKeyBeforeSend,
} from "@/lib/client-api";

const MAX_BYTES = 3 * 1024 * 1024;

function VisionStudioInner() {
  const [image, setImage] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [fileName, setFileName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [modelUsed, setModelUsed] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function chooseFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_BYTES) {
      setError("Choose a JPG, PNG, WebP or GIF image under 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result).split(",")[1] ?? "");
      setMediaType(file.type);
      setFileName(file.name);
      setAnswer("");
      setError("");
    };
    reader.onerror = () => setError("That image could not be opened. Try another file.");
    reader.readAsDataURL(file);
  }

  function reset() {
    setImage("");
    setMediaType("");
    setFileName("");
    setAnswer("");
    setError("");
    setModelUsed("");
  }

  async function runKeyTest() {
    setTestingKey(true);
    setKeyStatus(null);
    const res = await testGeminiKeyRequest();
    setTestingKey(false);
    setKeyStatus({ ok: res.ok, text: res.ok ? res.message : res.error });
    if (res.ok) setError("");
  }

  async function analyze(event: FormEvent) {
    event.preventDefault();
    if (!image || pending) return;

    const keyCheck = validateStoredKeyBeforeSend();
    if (!keyCheck.ok) {
      setError(keyCheck.error);
      return;
    }

    setPending(true);
    setError("");
    setAnswer("");
    setModelUsed("");
    setKeyStatus(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/vision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anvik-device": readDeviceId(),
          ...(keyCheck.apiKey ? { "x-google-generative-ai-api-key": keyCheck.apiKey } : {}),
        },
        body: JSON.stringify({
          image,
          mediaType,
          prompt: prompt.trim() || "Describe this image and point out the details that matter.",
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const result = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
        throw new Error(mapHttpErrorMessage(response.status, result?.error ?? result?.detail));
      }

      const model = response.headers.get("x-anvik-model") ?? "gemini-2.0-flash";
      setModelUsed(model);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let seen = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        seen += decoder.decode(value, { stream: true });
        setAnswer(seen);
      }
      recordDailyUsage(model);
    } catch (issue) {
      if (!controller.signal.aborted) {
        setError(mapClientFetchError(issue));
      }
    } finally {
      abortRef.current = null;
      setPending(false);
    }
  }

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy answer.");
    }
  }

  const showKeyHelper =
    error === KEY_FORMAT_MESSAGE ||
    error.toLowerCase().includes("key") ||
    error.toLowerCase().includes("aistudio");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#22D3EE]">
            <Eye className="h-3.5 w-3.5" /> Vision Studio
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Ask Gemini about{" "}
            <span className="gradient-text">any image.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Upload a photo, diagram, document, or screenshot and ask a question. Streamed live from Gemini.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-3 py-1.5 text-xs font-medium text-[#67e8f9]">
          <Sparkles className="h-3.5 w-3.5" /> From Gemini
        </span>
      </div>

      <form onSubmit={analyze} className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <TiltCard className="glass-card rounded-2xl p-4">
          <label
            htmlFor="vision-file"
            className="flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-[#050508]/60 p-4 text-center transition hover:border-[#22D3EE]/60"
          >
            {image ? (
              <div className="space-y-3">
                <div className="relative mx-auto h-52 w-full overflow-hidden rounded-lg">
                  <Image
                    src={`data:${mediaType};base64,${image}`}
                    alt="Image selected for analysis"
                    width={640}
                    height={480}
                    unoptimized
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="block truncate text-xs text-slate-300">{fileName}</span>
              </div>
            ) : (
              <>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#7C3AED]/20 text-[#22D3EE]">
                  <ImagePlus className="h-6 w-6" />
                </div>
                <b className="text-sm font-semibold text-white">Upload an image</b>
                <small className="mt-1 text-xs text-slate-400">JPG, PNG, WebP or GIF · up to 3 MB</small>
                <span className="mt-4 rounded-xl border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-200">
                  Browse files
                </span>
              </>
            )}
            <input
              id="vision-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => chooseFile(event.target.files?.[0])}
              className="sr-only"
            />
          </label>
        </TiltCard>

        <TiltCard className="glass-card flex flex-col justify-between rounded-2xl p-5">
          <div>
            <label htmlFor="vision-question" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Question about this image
            </label>
            <textarea
              id="vision-question"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={1200}
              rows={5}
              placeholder="Explain what is shown here, extract text, or summarize the key details..."
              className="mt-2 w-full rounded-xl border border-white/15 bg-[#050508]/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-[#22D3EE] focus:outline-none"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!image || pending}
              className="btn-gradient inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            >
              {pending ? (
                <>
                  <span className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  Analyzing...
                </>
              ) : (
                <>
                  Ask about image <ArrowUp className="h-4 w-4" />
                </>
              )}
            </button>
            {image && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
        </TiltCard>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          {showKeyHelper && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void runKeyTest()}
                disabled={testingKey}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1 font-semibold text-white hover:bg-white/20"
              >
                {testingKey ? "Testing..." : "Test Key"}
              </button>
              <Link
                href="/settings"
                className="rounded-lg bg-[#7C3AED] px-3 py-1 font-semibold text-white hover:bg-[#6d28d9]"
              >
                Open Settings
              </Link>
            </div>
          )}
        </div>
      )}

      {keyStatus && (
        <div
          role="status"
          className={`mt-3 flex items-center gap-2 rounded-xl border px-4 py-2 text-xs ${
            keyStatus.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          {keyStatus.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          )}
          <span>{keyStatus.text}</span>
        </div>
      )}

      {pending && !answer && (
        <div className="glass-card mt-6 flex items-center gap-3 rounded-2xl p-5 text-sm text-slate-300" role="status">
          <span className="typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>ANVIK is thinking...</span>
        </div>
      )}

      {answer && (
        <section className="glass-card mt-6 rounded-2xl p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#67e8f9]">
              <Sparkles className="h-3.5 w-3.5" /> From Gemini
              {modelUsed ? <span className="text-slate-400">· {modelUsed}</span> : null}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copyAnswer()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                aria-label="Clear analysis"
                onClick={() => setAnswer("")}
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:bg-white/10"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <Markdown text={answer} className="md" />
        </section>
      )}
    </main>
  );
}

export default function VisionStudio() {
  return (
    <ErrorBoundary title="Vision studio hit an unexpected error">
      <VisionStudioInner />
    </ErrorBoundary>
  );
}
