"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  Camera,
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
import { KEY_FORMAT_MESSAGE, readDeviceId } from "@/lib/client-key";
import {
  aiRequestHeaders,
  mapClientFetchError,
  mapHttpErrorMessage,
  testGeminiKeyRequest,
  validateStoredKeyBeforeSend,
} from "@/lib/client-api";
import { useSession } from "@/components/anvik/session-provider";

const MAX_BYTES = 3 * 1024 * 1024;

function VisionStudioInner() {
  const { bearerToken } = useSession();
  const [image, setImage] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
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

  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [cameraOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("camera") === "1") void openCamera();
    if (params.get("source") === "upload") document.getElementById("vision-file")?.click();
  }, []);

  async function openCamera() {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError("Allow camera access in your browser settings, then try again.");
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / video.videoWidth, 1600 / video.videoHeight);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setImage(canvas.toDataURL("image/jpeg", 0.86).split(",")[1] ?? "");
    setMediaType("image/jpeg");
    setFileName("Camera photo");
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setAnswer("");
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!supportedTypes.includes(file.type)) {
      setError("Choose a JPG, PNG, WebP or GIF image.");
      return;
    }

    let upload: Blob = file;
    if (file.size > MAX_BYTES) {
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1800 / bitmap.width, 1800 / bitmap.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        let quality = 0.86;
        let compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        while (compressed && compressed.size > MAX_BYTES && quality > 0.42) {
          quality -= 0.12;
          compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        }
        if (!compressed || compressed.size > MAX_BYTES) {
          setError("This image is too large to compress under 3 MB. Choose a smaller image.");
          return;
        }
        upload = compressed;
      } catch {
        setError("That image could not be compressed. Try a smaller file.");
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result).split(",")[1] ?? "");
      setMediaType(upload.type || file.type);
      setFileName(file.name);
      setAnswer("");
      setError("");
    };
    reader.onerror = () => setError("That image could not be opened. Try another file.");
    reader.readAsDataURL(upload);
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
        // /api/vision verifies the user before touching the model; without the
        // bearer token this request was guaranteed to 401 for everyone.
        headers: aiRequestHeaders({ token: bearerToken(), apiKey: keyCheck.apiKey }),
        body: JSON.stringify({
          image,
          mediaType,
          prompt: prompt.trim() || "Describe this image and point out the details that matter.",
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const result = (await response.json().catch(() => null)) as { error?: string; detail?: string; code?: string } | null;
        throw new Error(mapHttpErrorMessage(response.status, result?.error ?? result?.detail, result?.code));
      }

      const model = response.headers.get("x-anvik-model") ?? "ANVIK 1.0";
      setModelUsed("ANVIK 1.0");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let seen = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        seen += decoder.decode(value, { stream: true });
        setAnswer(seen);
      }
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
      <Link
        href="/chat"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] transition-colors hover:text-[#1A1A1A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D97757]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Chat
      </Link>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#C65E3A]">
            <Eye className="h-3.5 w-3.5" /> Vision Studio
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-4xl">
            Ask ANVIK about any image.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#666666]">
            Upload a photo, diagram, document, or screenshot and ask ANVIK a question.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#EDEDED] bg-[#FAFAF8] px-3 py-1.5 text-xs font-medium text-[#C65E3A]">
          <Sparkles className="h-3.5 w-3.5" /> ANVIK
        </span>
      </div>

      <form onSubmit={analyze} className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <TiltCard className="border border-[#EDEDED] bg-white shadow-sm rounded-2xl p-4">
          <label
            htmlFor="vision-file"
            className="flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#D9D9D9] bg-[#FAFAF8] p-4 text-center transition hover:border-[#C65E3A]"
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
                <span className="block truncate text-xs text-[#666666]">{fileName}</span>
              </div>
            ) : (
              <>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F7F7F5] text-[#C65E3A]">
                  <ImagePlus className="h-6 w-6" />
                </div>
                <b className="text-sm font-semibold text-[#1A1A1A]">Upload an image</b>
                <small className="mt-1 text-xs text-[#666666]">JPG, PNG, WebP or GIF · up to 3 MB</small>
                <span className="mt-4 rounded-xl border border-[#E5E5E5] bg-white px-4 py-1.5 text-xs font-medium text-[#1A1A1A]">
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
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => document.getElementById("vision-file")?.click()} className="rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-xs font-medium text-[#1A1A1A] hover:border-[#1A1A1A]">
              <ImagePlus className="mr-1.5 inline size-3.5" />Upload Photo
            </button>
            <button type="button" onClick={() => void openCamera()} className="rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-xs font-medium text-[#1A1A1A] hover:border-[#1A1A1A]">
              <Camera className="mr-1.5 inline size-3.5" />Take Photo
            </button>
            {image && (
              <button type="button" onClick={() => void openCamera()} className="rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-xs font-medium text-[#1A1A1A] hover:border-[#1A1A1A]">
                <Camera className="mr-1.5 inline size-3.5" />Retake
              </button>
            )}
          </div>
          {cameraError && <p role="alert" className="mt-2 text-xs text-[#666666]">{cameraError}</p>}
          {cameraOpen && (
            <div className="mt-3 rounded-xl border border-[#E5E5E5] bg-white p-3">
              <video ref={videoRef} autoPlay playsInline aria-label="Live camera preview" className="max-h-64 w-full rounded-lg object-contain" />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={capturePhoto} className="rounded-lg bg-[#1A1A1A] px-3 py-2 text-xs font-medium text-white">Capture</button>
                <button type="button" onClick={() => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setCameraOpen(false); }} className="rounded-lg border border-[#E5E5E5] px-3 py-2 text-xs text-[#1A1A1A]">Cancel</button>
              </div>
            </div>
          )}
        </TiltCard>

        <TiltCard className="border border-[#EDEDED] bg-white shadow-sm flex flex-col justify-between rounded-2xl p-5">
          <div>
            <label htmlFor="vision-question" className="block text-xs font-semibold uppercase tracking-wider text-[#666666]">
              Question about this image
            </label>
            <textarea
              id="vision-question"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={1200}
              rows={5}
              placeholder="Explain what is shown here, extract text, or summarize the key details..."
              className="mt-2 w-full rounded-xl border border-[#E5E5E5] bg-[#FAFAF8] px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#999999] focus:border-[#1A1A1A] focus:outline-none"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!image || pending}
              className="bg-[#1A1A1A] hover:bg-[#333333] inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
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
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F7F7F5]"
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
                className="rounded-lg border border-[#EDEDED] bg-white px-3 py-1 font-semibold text-[#1A1A1A] hover:bg-[#F7F7F5]"
              >
                {testingKey ? "Testing..." : "Test Key"}
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
        <div className="border border-[#EDEDED] bg-white shadow-sm mt-6 flex items-center gap-3 rounded-2xl p-5 text-sm text-[#666666]" role="status">
          <span className="typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>ANVIK is thinking...</span>
        </div>
      )}

      {answer && (
        <section className="border border-[#EDEDED] bg-white shadow-sm mt-6 rounded-2xl p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C65E3A]">
              <Sparkles className="h-3.5 w-3.5" /> ANVIK
              {modelUsed ? <span className="text-[#666666]">· {modelUsed}</span> : null}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copyAnswer()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEDED] bg-[#F7F7F5] px-2.5 py-1 text-xs text-[#666666] hover:bg-white/10"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                aria-label="Clear analysis"
                onClick={() => setAnswer("")}
                className="rounded-lg border border-white/10 bg-[#F7F7F5] p-1.5 text-[#666666] hover:bg-white/10"
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
