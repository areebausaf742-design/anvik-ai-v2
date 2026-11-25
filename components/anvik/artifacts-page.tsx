"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  LayoutGrid,
  Trash2,
} from "lucide-react";
import TiltCard from "@/components/anvik/tilt-card";
import {
  MAX_GALLERY,
  persistGallery,
  readGallery,
  type GeneratedImage,
} from "@/lib/gallery";

function timeAgo(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function GalleryCard({
  item,
  index,
  onDelete,
}: {
  item: GeneratedImage;
  index: number;
  onDelete: (index: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopied(true);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the prompt stays visible */
    }
  }

  return (
    <TiltCard className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm flex flex-col overflow-hidden">
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
            <span className="text-[#999999]">{timeAgo(item.createdAt)}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#1A1A1A]">{item.prompt}</p>
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
            onClick={() => void copyPrompt()}
            className="inline-flex items-center gap-1 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1A1A1A] hover:bg-[#F7F7F5]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy prompt"}
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-500/10 px-2 py-1.5 text-xs font-semibold text-rose-600"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="ml-1 inline-flex items-center rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-xs font-medium text-[#666666] hover:bg-[#F7F7F5]"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Delete artifact"
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[#EDEDED] bg-white/[0.03] px-2 py-1.5 text-xs text-[#666666] hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </TiltCard>
  );
}

export default function ArtifactsPage() {
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setGallery(readGallery());
    setHydrated(true);
  }, []);

  function removeItem(index: number) {
    const next = gallery.filter((_, i) => i !== index);
    setGallery(next);
    if (!persistGallery(next)) {
      setNotice("Browser storage is tight; keeping the rest of the gallery in this session.");
    } else {
      setNotice("");
    }
  }

  return (
    <main className="premium-library-page premium-artifacts-page mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        href="/chat"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-[#666666] transition-colors hover:text-[#1A1A1A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D97757]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Chat
      </Link>
      <div className="library-page-header mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#D97757]">
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" /> Artifacts
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1A1A1A] sm:text-4xl">
            Your generated creations.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#666666]">
            Every image rendered in the studio, kept on this device. Download, copy the prompt or tidy up — all on this page.
          </p>
        </div>
        <Link
          href="/image"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#333333]"
        >
          Open Image Studio <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="library-section-header mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            {gallery.length ? "Gallery" : "Nothing rendered yet"}
          </h2>
          <p className="mt-0.5 text-xs text-[#666666]">
            {gallery.length ? `${gallery.length} of ${MAX_GALLERY} saved` : "0 of 12 saved"}
          </p>
        </div>
        {notice ? <p className="max-w-md rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700" role="status">{notice}</p> : null}
      </div>

      {hydrated && gallery.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E5E5E5] bg-white px-6 py-16 text-center">
          <LayoutGrid className="h-10 w-10 text-[#D97757]" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-[#1A1A1A]">No artifacts yet</h2>
          <p className="mt-1 max-w-sm text-sm text-[#666666]">
            Render an image in the studio and it lands here, ready to download or reuse for another idea.
          </p>
          <Link
            href="/image"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#333333]"
          >
            Open Image Studio <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {gallery.map((item, index) => (
            <GalleryCard key={`${item.prompt}-${index}-${item.image.slice(-16)}`} item={item} index={index} onDelete={removeItem} />
          ))}
        </div>
      )}
    </main>
  );
}
