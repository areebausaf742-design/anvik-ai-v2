import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import { langLabel } from "@/lib/detect";
import { PlainText } from "@/components/anvik/markdown";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/**
 * Public answer page. Everything here is failure-tolerant: `store` serves from
 * memory when the filesystem is read-only, so a shareable link never 500s
 * (audit C-1). If the slug is genuinely unknown, that is a 404, not an error.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const row = store.bySlug(slug);
  if (!row) return { title: "Not found", robots: { index: false, follow: false } };
  const question = store.questionById(row.questionId)?.text ?? row.slug;
  const description = row.body.replace(/\s+/g, " ").slice(0, 160);
  /* §4.3: OG text preview, deliberately no image — a text preview forwards
     like a person sharing something useful; a branded card forwards like ads. */
  return {
    title: question,
    description,
    openGraph: { title: question, description, type: "article" },
    /* Owner spec 21 Nov: noindex until a human reviews the answer. */
    robots:
      row.reviewed && row.moderationState !== "flagged"
        ? { index: true, follow: true }
        : { index: false, follow: false },
  };
}

export default async function PublicAnswer({ params }: Params) {
  const { slug } = await params;
  const row = store.bySlug(slug);
  if (!row) notFound();

  const question = store.questionById(row.questionId)?.text ?? row.slug;
  const when = new Date(row.publishedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="pub">
      <h1 className="q-head">{question}</h1>
      <div className="a-body">
        {row.body.split("\n\n").map((paragraph, index) => (
          <p key={`p-${index}`}>
            <PlainText text={paragraph} />
          </p>
        ))}
      </div>
      <p className="meta-line">
        {when} · answered in {langLabel(row.lang)} · public answer
        {row.reviewed ? "" : " · awaiting review"}
      </p>
      <div className="pub-cta">
        <p>Anvik — ask anything, plainly.</p>
        <Link className="ask-btn" href="/chat">
          Ask your own
        </Link>
      </div>
    </main>
  );
}
