import type { MetadataRoute } from "next";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

const base = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://anvik.ai").replace(/\/+$/, "");

/**
 * Reviewed answers only — the same set the gallery shows. Listing unreviewed
 * pages here contradicted their own `robots: noindex` (audit M-17), and an
 * unreachable or read-only data dir must still produce a valid sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const root = base();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${root}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${root}/chat`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${root}/library`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${root}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${root}/about`, changeFrequency: "yearly", priority: 0.4 },
  ];

  let answers: MetadataRoute.Sitemap = [];
  try {
    answers = store.reviewedWithQuestions().map(({ answer }) => ({
      url: `${root}/j/${answer.slug}`,
      lastModified: new Date(answer.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch {
    /* a broken store must not take the sitemap down with it */
  }

  return [...staticRoutes, ...answers];
}
