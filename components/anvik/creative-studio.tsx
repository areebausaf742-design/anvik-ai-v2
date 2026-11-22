"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import Markdown from "@/components/anvik/markdown";
import TiltCard from "@/components/anvik/tilt-card";
import ErrorBoundary from "@/components/anvik/error-boundary";
import {
  KEY_FORMAT_MESSAGE,
  readDeviceId,
} from "@/lib/client-key";
import {
  mapClientFetchError,
  mapHttpErrorMessage,
  testGeminiKeyRequest,
  validateStoredKeyBeforeSend,
} from "@/lib/client-api";
import {
  compressImageForStorage,
  persistGallery,
  readGallery,
  type GeneratedImage,
} from "@/lib/gallery";

const IMAGE_STYLES = ["Cinematic", "Anime", "3D", "Photoreal", "Cyberpunk"];
const IMAGE_IDEAS = [
  "An iridescent jellyfish drifting through a deep-ocean city, cinematic lighting",
  "A quiet glass greenhouse on Mars at dawn, warm golden sunbeams, photoreal",
  "A floating cyberpunk library above neon clouds, 3D isometric render",
];

const MAX_GALLERY = 12;

function promptWithStyle(value: string, selectedStyle: string) {
  const basePrompt = value
    .replace(/,?\s*in (cinematic|anime|3d|3d render|photoreal|cyberpunk|realistic) style,?\s*ultra detailed\.?$/i, "")
    .replace(/,?\s*in (cinematic|anime|3d|3d render|photoreal|cyberpunk|realistic) style\.?$/i, "")
    .replace(/[.,\s]+$/, "")
    .trim();
  return basePrompt ? `${basePrompt}, in ${selectedStyle.toLowerCase()} style` : "";
}

function InlineKeyAlert({
  error,
  onTestedOk,
}: {
  error: string;
  onTestedOk: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  if (!error) return null;
  const showKeyTools =
    error === KEY_FORMAT_MESSAGE ||
    error.toLowerCase().includes("key") ||
    error.toLowerCase().includes("aistudio");

  async function runTest() {
    setTesting(true);
    setStatus(null);
    const res = await testGeminiKeyRequest();
    setTesting(false);
    setStatus({ ok: res.ok, text: res.ok ? res.message : res.error });
    if (res.ok) onTestedOk();
  }

  return (
    <div className="space-y-2">
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
        {showKeyTools && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runTest()}
              disabled={testing}
              className="rounded-lg border border-[#EDEDED] bg-white px-3 py-1 font-semibold text-[#1A1A1A] hover:bg-[#F7F7F5]"
            >
              {testing ? "Testing..." : "Test Key"}
            </button>
            <Link
              href="/settings"
              className="rounded-lg bg-[#1A1A1A] px-3 py-1 font-semibold text-white hover:bg-[#333333]"
            >
              Open Settings
            </Link>
          </div>
        )}
      </div>
      {status && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs ${
            status.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          {status.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          )}
          <span>{status.text}</span>
        </div>
      )}
    </div>
  );
}

function ImageStudio() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(IMAGE_STYLES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  const [copiedId, setCopiedId] = useState("");

  useEffect(() => {
    setGallery(readGallery());
  }, []);

  function saveGallery(nextGallery: GeneratedImage[]) {
    const limited = nextGallery.slice(0, MAX_GALLERY);
    setGallery(limited);
    if (!persistGallery(limited)) {
      setNotice("Browser storage is tight; keeping the latest renders in this session.");
      return;
    }
    setNotice("");
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || loading) return;

    const keyCheck = validateStoredKeyBeforeSend();
    if (!keyCheck.ok) {
      setError(keyCheck.error);
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anvik-device": readDeviceId(),
          ...(keyCheck.apiKey ? { "x-google-generative-ai-api-key": keyCheck.apiKey } : {}),
        },
        body: JSON.stringify({ prompt: prompt.trim(), style }),
      });

      const result = (await response.json().catch(() => null)) as {
        image?: string;
        prompt?: string;
        style?: string;
        provider?: string;
        model?: string;
        error?: string;
        code?: string;
      } | null;

      if (!response.ok || typeof result?.image !== "string") {
        throw new Error(mapHttpErrorMessage(response.status, result?.error, result?.code));
      }

      const compactImage = await compressImageForStorage(result.image);
      saveGallery([
        {
          image: compactImage,
          prompt: result.prompt ?? prompt.trim(),
          style: result.style ?? style,
          provider: result.provider,
          model: result.model,
          createdAt: Date.now(),
        },
        ...gallery,
      ]);
    } catch (issue) {
      setError(mapClientFetchError(issue));
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value: string, keyId: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(keyId);
      window.setTimeout(() => setCopiedId(""), 1600);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  function remove(index: number) {
    saveGallery(gallery.filter((_, i) => i !== index));
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#D97757]">
            <Sparkles className="h-3.5 w-3.5" /> Image Studio
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1A1A1A] sm:text-4xl">
            Describe a scene.{" "}
            <span className="text-[#1A1A1A]">See it rendered.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#666666]">
            Choose a visual style, generate artwork, and keep up to 12 creations on this device.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#EDEDED] bg-[#F7F7F5] px-3 py-1.5 text-xs font-medium text-[#D97757]">
          <Sparkles className="h-3.5 w-3.5" /> ANVIK
        </span>
      </div>

      <TiltCard className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm rounded-2xl p-5 sm:p-6">
        <form onSubmit={generate} className="space-y-4">
          <div>
            <label htmlFor="image-prompt" className="block text-xs font-semibold uppercase tracking-wider text-[#666666]">
              Visual prompt
            </label>
            <textarea
              id="image-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={1600}
              rows={3}
              placeholder="A futuristic neon glass conservatory floating above storm clouds, warm golden light"
              className="mt-2 w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#999999] focus:border-[#D97757] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose an image style">
            {IMAGE_STYLES.map((item) => {
              const active = style === item;
              return (
                <button
                  type="button"
                  key={item}
                  aria-pressed={active}
                  onClick={() => {
                    setStyle(item);
                    setPrompt((current) => promptWithStyle(current, item));
                  }}
                  className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                    active
? "border-[#E5E5E5] bg-[#F7F7F5] text-[#1A1A1A] shadow-sm"
                          : "border-[#EDEDED] bg-white text-[#666666] hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-xs text-[#666666]">{prompt.length}/1600 characters</span>
            <button
              type="submit"
              disabled={!prompt.trim() || loading}
              className="bg-[#1A1A1A] hover:bg-[#333333] inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-[#1A1A1A]"
            >
              {loading ? (
                <>
                  <span className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  Rendering...
                </>
              ) : (
                <>
                  Generate Image <Sparkles className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </TiltCard>

      <div className="mt-4">
        <InlineKeyAlert error={error} onTestedOk={() => setError("")} />
      </div>

      {notice && (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200" role="status">
          {notice}
        </p>
      )}

      {loading && (
        <div className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm mt-6 flex flex-col items-center justify-center rounded-2xl p-8 text-center" role="status">
          <div className="mx-auto size-6 animate-spin rounded-full border-2 border-[#EDEDED] border-t-[#D97757]" aria-hidden="true" />
          <p className="mt-4 text-sm font-medium text-[#666666]">Crafting prompt &amp; rendering artwork...</p>
          <p className="mt-1 text-xs text-[#666666]">Using your ANVIK key</p>
        </div>
      )}

      <div className="mt-10 mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#666666]">Gallery</p>
          <h2 className="mt-1 text-xl font-semibold text-[#1A1A1A]">
            {gallery.length ? "Your Creations" : "Prompt Starters"}
          </h2>
        </div>
        <span className="text-xs text-[#666666]">
          {gallery.length ? `${gallery.length} of ${MAX_GALLERY} saved` : "0 of 12 saved"}
        </span>
      </div>

      {gallery.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {gallery.map((item, index) => {
            const copyKey = `img-${index}`;
            return (
              <TiltCard
                key={`${item.prompt}-${index}-${item.image.slice(-16)}`}
                className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm flex flex-col overflow-hidden rounded-2xl"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-[#F9F9F9]">
                  <Image
                    src={item.image}
                    alt={item.prompt}
                    fill
                    unoptimized={!item.image.startsWith("https://image.pollinations.ai")}
                    referrerPolicy="no-referrer"
                    className="object-cover"
                    sizes="(max-width: 720px) 100vw, 420px"
                  />
                </div>
                <div className="flex flex-1 flex-col justify-between p-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider">
                      <span className="text-[#D97757]">{item.style}</span>
                      <span className="rounded bg-[#F7F7F5] px-1.5 py-0.5 text-[#666666]">
                        ANVIK
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#1A1A1A]">
                      {item.prompt}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EDEDED] pt-3">
                    <a
                      href={item.image}
                      download={`anvik-art-${index + 1}.png`}
                      aria-label="Download generated image"
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F7F7F5]"
                    >
                      <Download className="h-3.5 w-3.5 text-[#D97757]" /> Download
                    </a>
                    <button
                      type="button"
                      onClick={() => void copyText(item.prompt, copyKey)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F7F7F5]"
                    >
                      {copiedId === copyKey ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedId === copyKey ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      aria-label="Remove from gallery"
                      className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[#EDEDED] bg-white/[0.03] px-2 py-1.5 text-xs text-[#666666] hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </TiltCard>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {IMAGE_IDEAS.map((idea, index) => (
            <TiltCard key={idea} className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm rounded-2xl">
              <button
                type="button"
                onClick={() => setPrompt(idea)}
                className="flex h-full w-full flex-col justify-between p-5 text-left"
              >
                <span className="font-mono text-xs text-[#D97757]">0{index + 1} / Starter</span>
                <p className="mt-2 text-sm leading-relaxed text-[#1A1A1A]">{idea}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#1A1A1A]">
                  Use prompt <ArrowRight className="h-3.5 w-3.5 text-[#D97757]" />
                </span>
              </button>
            </TiltCard>
          ))}
        </div>
      )}
    </main>
  );
}

/** Extract the first fenced code block from markdown output for live preview. */
function extractFirstCodeBlock(markdown: string): { lang: string; code: string } {
  const match = markdown.match(/```(\S*)\n([\s\S]*?)```/);
  if (match) {
    return { lang: (match[1] || "").toLowerCase(), code: match[2].trim() };
  }
  return { lang: "", code: markdown.trim() };
}

function buildPreviewHtml(rawCode: string, language: string): string {
  const lower = language.toLowerCase();
  if (lower.includes("html") || /<!doctype html|<html|<body|<div|<button/i.test(rawCode)) {
    const hasBodyBg = /body\s*\{[^}]*background/i.test(rawCode);
    if (hasBodyBg) return rawCode;
    const baseStyle = `<style>html,body{background:#090910;color:#f8fafc;margin:0;padding:16px;font-family:system-ui,-apple-system,sans-serif;}</style>`;
    if (/<head>/i.test(rawCode)) {
      return rawCode.replace(/<head>/i, `<head>${baseStyle}`);
    }
    return `<!doctype html><html><head>${baseStyle}</head><body>${rawCode}</body></html>`;
  }
  if (lower === "css") {
    return `<!doctype html><html><head><style>body{background:#090910;color:#f8fafc;font-family:system-ui,sans-serif;padding:24px}${rawCode}</style></head><body><div class="card preview-box"><h3>CSS Preview</h3><p>Styled element inside live sandbox.</p><button>Action</button></div></body></html>`;
  }
  if (lower === "javascript" || lower === "js" || lower === "typescript" || lower === "ts" || lower === "tsx") {
    const cleaned = rawCode
      .replace(/^\s*import\s+.*$/gm, "")
      .replace(/\bexport\s+default\s+/g, "")
      .replace(/\bexport\s+/g, "");
    return `<!doctype html><html><head><style>body{background:#090910;color:#e2e8f0;font-family:ui-monospace,monospace;padding:16px;font-size:13px;line-height:1.6}pre{margin:0;white-space:pre-wrap}.err{color:#fb7185}.ok{color:#34d399}</style></head><body><div id="app"></div><pre id="out"></pre><script>
const out = document.getElementById('out');
const log = (...args) => { out.textContent += args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n'; };
console.log = log;
console.info = log;
console.error = (...args) => { const d = document.createElement('div'); d.className='err'; d.textContent = args.join(' '); out.appendChild(d); };
try {
${cleaned}
if (!out.textContent && !document.getElementById('app').innerHTML) {
  out.innerHTML = '<span class="ok">Executed cleanly (no console output produced).</span>';
}
} catch (e) {
  console.error('Runtime note: ' + e.message);
}
</script></body></html>`;
  }

  return `<!doctype html><html><body style="background:#090910;color:#cbd5e1;font-family:system-ui,sans-serif;padding:20px;font-size:13px"><p>Interactive browser preview supports HTML/CSS and JavaScript snippets. Copy the ${language} code to run it in your ${language} runtime.</p></body></html>`;
}

function CodeLab() {
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("Python");
  const [modelUsed, setModelUsed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || loading) return;

    const keyCheck = validateStoredKeyBeforeSend();
    if (!keyCheck.ok) {
      setError(keyCheck.error);
      return;
    }

    setLoading(true);
    setError("");
    setCode("");
    setModelUsed("");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anvik-device": readDeviceId(),
          ...(keyCheck.apiKey ? { "x-google-generative-ai-api-key": keyCheck.apiKey } : {}),
        },
        body: JSON.stringify({ prompt: prompt.trim(), language }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const result = (await response.json().catch(() => null)) as { error?: string; detail?: string; code?: string } | null;
        throw new Error(mapHttpErrorMessage(response.status, result?.error ?? result?.detail, result?.code));
      }
      const model = response.headers.get("x-anvik-model") ?? "gemini-2.0-flash";
      setModelUsed("ANVIK 1.0");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let generated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        generated += decoder.decode(value, { stream: true });
        setCode(generated);
      }
      if (!generated.trim()) throw new Error("ANVIK returned no code. Please try again.");
    } catch (issue) {
      if (!controller.signal.aborted) {
        setError(mapClientFetchError(issue));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  const extension =
    language === "Python"
      ? "py"
      : language === "HTML/CSS"
        ? "html"
        : language === "CSS"
          ? "css"
          : language === "SQL"
            ? "sql"
            : language === "JavaScript"
              ? "js"
              : "tsx";

  const extracted = extractFirstCodeBlock(code);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(extracted.code || code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Could not copy the code.");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#D97757]">
            <Code2 className="h-3.5 w-3.5" /> Code Lab
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1A1A1A] sm:text-4xl">
            Describe it.{" "}
            <span className="text-[#1A1A1A]">Ship runnable code.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#666666]">
            Pick a language, generate clean syntax-highlighted code with ANVIK, copy blocks, or preview HTML/CSS/JS live.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#EDEDED] bg-[#F7F7F5] px-3 py-1.5 text-xs font-medium text-[#D97757]">
          <Sparkles className="h-3.5 w-3.5" /> ANVIK{modelUsed ? ` · ${modelUsed}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <TiltCard className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm rounded-2xl p-5 lg:col-span-5">
          <form onSubmit={create} className="space-y-4">
            <div>
              <label htmlFor="code-prompt" className="block text-xs font-semibold uppercase tracking-wider text-[#666666]">
                What are we building?
              </label>
              <textarea
                id="code-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={6000}
                rows={6}
                placeholder="Write a Python calculator or a responsive pricing card in HTML/CSS"
                className="mt-2 w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#999999] focus:border-[#D97757] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="code-language" className="block text-xs font-semibold uppercase tracking-wider text-[#666666]">
                Language
              </label>
              <select
                id="code-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-2.5 text-sm text-[#1A1A1A] focus:border-[#D97757] focus:outline-none"
              >
                <option value="Python">Python</option>
                <option value="TypeScript">TypeScript</option>
                <option value="JavaScript">JavaScript</option>
                <option value="HTML/CSS">HTML/CSS</option>
                <option value="CSS">CSS</option>
                <option value="SQL">SQL</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!prompt.trim() || loading}
              className="bg-[#1A1A1A] hover:bg-[#333333] flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-[#1A1A1A]"
            >
              {loading ? (
                <>
                  <span className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  Generating code...
                </>
              ) : (
                <>
                  Generate Code <ArrowUp className="h-4 w-4" />
                </>
              )}
            </button>
            <p className="text-right text-[11px] text-slate-500">{prompt.length}/6000 characters</p>
          </form>
        </TiltCard>

        <section className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm flex min-h-[380px] flex-col overflow-hidden rounded-2xl lg:col-span-7" aria-label="Generated code">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EDEDED] bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              </div>
              <span className="font-mono text-xs text-[#666666]">draft.{extension}</span>
            </div>

            <div className="flex items-center gap-2">
              {code && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                      showPreview
                        ? "border-[#22D3EE] bg-[#22D3EE]/20 text-[#1A1A1A]"
                        : "border-[#E5E5E5] bg-white text-[#1A1A1A] hover:bg-[#F7F7F5]"
                    }`}
                  >
                    <Play className="h-3.5 w-3.5 text-[#D97757]" />
                    {showPreview ? "Hide preview" : "Run preview"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    aria-label="Copy code"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1 text-xs font-medium text-[#1A1A1A] hover:bg-[#F7F7F5]"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy code"}
                  </button>
                </>
              )}
            </div>
          </header>

          {showPreview && code ? (
            <div className="flex flex-1 flex-col bg-[#F9F9F9]">
              <div className="border-b border-[#EDEDED] bg-[#F7F7F5] px-4 py-1.5 text-[11px] font-medium text-[#666666]">
                Sandboxed Live Preview ({extracted.lang || language})
              </div>
              <iframe
                title="Code Lab Live Preview"
                sandbox="allow-scripts"
                srcDoc={buildPreviewHtml(extracted.code, extracted.lang || language)}
                className="min-h-[340px] w-full flex-1 bg-[#F9F9F9]"
              />
            </div>
          ) : code ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              <Markdown text={code} className="md" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className={`size-4 rounded-full border-2 border-[#EDEDED] border-t-[#D97757] ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              <b className="mt-4 text-sm font-semibold text-[#1A1A1A]">
                {loading ? "ANVIK is writing your code..." : "Your syntax-highlighted draft appears here"}
              </b>
              <p className="mt-1 max-w-sm text-xs text-[#666666]">
                Describe what you want on the left, choose a language, and stream a clean implementation.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="mt-4">
        <InlineKeyAlert error={error} onTestedOk={() => setError("")} />
      </div>
    </main>
  );
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => Recognition;

function VoiceStudio() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [modelUsed, setModelUsed] = useState("");
  const [pending, setPending] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const Speech = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Speech) {
      setError("Microphone dictation is not supported in this browser — type or paste your question below.");
      return;
    }
    const recognition = new Speech();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) =>
      setTranscript(Array.from(event.results).map((result) => result[0].transcript).join(""));
    recognition.onerror = () => {
      setError("Allow microphone access or type your question below.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
  }

  function speakAnswer() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Text-to-speech is not supported in this browser.");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const clean = answer.replace(/[#*`>_]/g, " ").trim();
    if (!clean) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  async function ask() {
    const text = transcript.trim();
    if (!text || pending) return;

    const keyCheck = validateStoredKeyBeforeSend();
    if (!keyCheck.ok) {
      setError(keyCheck.error);
      return;
    }

    setPending(true);
    setError("");
    setAnswer("");
    setModelUsed("");
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }

    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anvik-device": readDeviceId(),
          ...(keyCheck.apiKey ? { "x-google-generative-ai-api-key": keyCheck.apiKey } : {}),
        },
        body: JSON.stringify({ transcript: text }),
      });
      if (!response.ok || !response.body) {
        const result = (await response.json().catch(() => null)) as { error?: string; detail?: string; code?: string } | null;
        throw new Error(mapHttpErrorMessage(response.status, result?.error ?? result?.detail, result?.code));
      }
      const model = response.headers.get("x-anvik-model") ?? "gemini-2.0-flash";
      setModelUsed("ANVIK 1.0");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let spoken = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        spoken += decoder.decode(value, { stream: true });
        setAnswer(spoken);
      }
    } catch (issue) {
      setError(mapClientFetchError(issue));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-8 text-center sm:px-6">
      <div className="mb-4 flex w-full items-center justify-between">
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] hover:text-[#1A1A1A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Chat
        </Link>
        <span className="inline-flex items-center gap-1 rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-2.5 py-1 text-xs font-medium text-[#D97757]">
          <Sparkles className="h-3 w-3" /> ANVIK
        </span>
      </div>

      <div className="relative my-4 flex items-center justify-center">
        <div className={`size-10 rounded-full border border-[#EDEDED] bg-[#D97757]/10 ${listening ? "animate-pulse" : ""}`} role="status" aria-label={listening ? "Listening" : pending ? "Processing audio" : "Voice input ready"} />
      </div>

      <h1 className="text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
        {listening ? "Listening..." : "Speak or type to "}
        {!listening && <span className="text-[#1A1A1A]">ANVIK Voice.</span>}
      </h1>
      <p className="mt-2 max-w-lg text-sm text-[#666666]">
        Tap the microphone to transcribe speech, edit if needed, stream ANVIK&apos;s answer, and listen aloud.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={toggleListening}
          aria-label={listening ? "Stop listening" : "Start speaking"}
          className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold transition ${
            listening
              ? "border border-rose-200 bg-rose-50 text-rose-700"
              : "bg-[#1A1A1A] text-white hover:bg-[#333333]"
          }`}
        >
          {listening ? <Pause className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          <span>{listening ? "Stop listening" : "Mic to text"}</span>
        </button>
      </div>

      <div className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm mt-6 w-full rounded-2xl p-4 text-left">
        <label htmlFor="voice-transcript" className="block text-xs font-semibold uppercase tracking-wider text-[#666666]">
          Spoken or typed question
        </label>
        <textarea
          id="voice-transcript"
          rows={3}
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder="Tap 'Mic to text' or type anything here..."
          className="mt-2 w-full rounded-xl border border-[#EDEDED] bg-white px-3.5 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#999999] focus:border-[#D97757] focus:outline-none"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void ask()}
            disabled={!transcript.trim() || pending}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-2 text-sm font-semibold text-white hover:bg-[#333333]"
          >
            {pending ? (
              <>
                <span className="typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                ANVIK is thinking
              </>
            ) : (
              <>
                Ask ANVIK <ArrowUp className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 w-full text-left">
        <InlineKeyAlert error={error} onTestedOk={() => setError("")} />
      </div>

      {answer && (
        <section className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm mt-6 w-full rounded-2xl p-5 text-left" aria-live="polite">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#EDEDED] pb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D97757]">
              <Sparkles className="h-3.5 w-3.5" /> ANVIK
              {modelUsed ? <span className="text-[#666666]">· {modelUsed}</span> : null}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={speakAnswer}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEDED] bg-white px-3 py-1 text-xs font-semibold text-[#1A1A1A] hover:bg-[#F7F7F5]"
              >
                {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5 text-[#D97757]" />}
                <span>{speaking ? "Stop voice" : "Speak answer"}</span>
              </button>
              <button
                type="button"
                aria-label="Clear answer"
                onClick={() => setAnswer("")}
                className="rounded-lg border border-[#EDEDED] bg-white p-1.5 text-[#666666] hover:bg-[#F7F7F5]"
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

export default function CreativeStudio({ kind }: { kind: "image" | "code" | "voice" }) {
  return (
    <ErrorBoundary title="Studio encountered an unexpected error">
      {kind === "image" ? <ImageStudio /> : kind === "code" ? <CodeLab /> : <VoiceStudio />}
    </ErrorBoundary>
  );
}
