/**
 * Shared generated-image gallery — the single storage contract for the image
 * studio and the /artifacts page. Pure client-side helper: the gallery lives
 * in localStorage (device-scoped), exactly as before.
 *
 * Entry shape is backwards compatible — older entries may lack `createdAt`.
 */

export const GALLERY_STORAGE_KEY = "anvik-image-gallery";
export const MAX_GALLERY = 12;

export type GeneratedImage = {
  image: string;
  prompt: string;
  style: string;
  provider?: string;
  model?: string;
  createdAt?: number;
};

export function isGeneratedImage(value: unknown): value is GeneratedImage {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GeneratedImage>;
  return typeof item.image === "string" && typeof item.prompt === "string" && typeof item.style === "string";
}

/** Read the gallery from localStorage — never throws. */
export function readGallery(): GeneratedImage[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(GALLERY_STORAGE_KEY);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isGeneratedImage).slice(0, MAX_GALLERY);
  } catch {
    return [];
  }
}

/**
 * Persist the gallery, shrinking from the oldest entry when storage is tight.
 * Returns false when nothing fit (session-only gallery), true otherwise.
 */
export function persistGallery(next: GeneratedImage[]): boolean {
  const limited = next.slice(0, MAX_GALLERY);
  if (typeof window === "undefined") return false;
  let candidate = limited;
  while (candidate.length > 0) {
    try {
      window.localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(candidate));
      return true;
    } catch {
      candidate = candidate.slice(0, candidate.length - 1);
    }
  }
  try {
    window.localStorage.removeItem(GALLERY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return false;
}

/** Compress large Gemini data URLs to ~512px WebP/JPEG so 12 images fit in localStorage. */
export async function compressImageForStorage(src: string): Promise<string> {
  if (!src.startsWith("data:") || src.length < 180_000) return src;
  if (typeof document === "undefined") return src;
  try {
    const img = document.createElement("img");
    img.src = src;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
    });
    const maxDim = 512;
    const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL("image/webp", 0.78);
    return webp.length < src.length ? webp : canvas.toDataURL("image/jpeg", 0.78);
  } catch {
    return src;
  }
}
