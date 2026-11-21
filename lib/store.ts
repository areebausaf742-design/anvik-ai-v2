/**
 * Storage layer — plan §6.3 (seven tables).
 *
 * Order of preference, all behind one interface:
 *   1. Supabase PostgREST, when SUPABASE_URL + a key are set (reads are hydrated
 *      into memory at boot; writes are mirrored best-effort).
 *   2. An in-memory document seeded from the corpus — always available.
 *   3. A JSON file under ANVIK_DATA_DIR, used only as a local convenience when
 *      the filesystem is writable. On a read-only filesystem (Vercel) the file
 *      is silently skipped: every read still answers from memory, so
 *      /j/[slug], /sitemap.xml and /api/ask can never 500 on EACCES/EROFS.
 *
 * Every entry point is failure-tolerant by contract: a broken disk, a missing
 * table or an offline network must degrade, never throw.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CORPUS, type CorpusEntry } from "./corpus";
import { slugify } from "./transliterate";
import type { Lang } from "./detect";
import { sbInsert, sbSelect, supabaseEnabled } from "./supabase";

export type ModerationState = "clean" | "flagged" | "removed";

export type QuestionRow = {
  id: string;
  deviceId: string;
  text: string;
  lang: Lang;
  slug: string | null;
  idempotencyKey: string | null;
  createdAt: number;
  status: "answered" | "duplicate" | "refused" | "partial";
};

export type AnswerRow = {
  id: string;
  questionId: string;
  body: string;
  model: string;
  promptTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costPaise: number;
  latencyMs: number;
  isPublic: boolean;
  publishedAt: number;
  moderationState: ModerationState;
  /** Owner spec 21 Nov: /j/ pages stay noindex and out of the gallery until
   *  a human reviews them. Seed corpus is authored = reviewed. */
  reviewed: boolean;
  lang: Lang;
  slug: string;
};

export type ModerationRow = {
  id: string;
  questionText: string;
  stage: "input" | "output" | "report";
  reasonCode: string;
  action: string;
  createdAt: number;
};

type DB = {
  questions: QuestionRow[];
  answers: AnswerRow[];
  quota: Record<string, { day: string; remaining: number }>;
  moderation: ModerationRow[];
  idempotency: Record<string, string>; // key -> answerId
};

export const FREE_DAILY = 3;
export const RATE_PER_MIN = 6;
export const RATE_PER_HOUR = 20;
/** Plan §7.4 control 1: global daily model-spend ceiling, in paise (₹500). */
export const DAILY_CEILING_PAISE = 50000;

const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");
const g = globalThis as unknown as { __anvikDb?: DB; __anvikLock?: Promise<unknown> };

/* ---------------- persistence probes (never throw) ---------------- */

/** Resolve the data dir, falling back to the OS temp dir when cwd is read-only. */
function resolveDbFile(): string | null {
  const candidates = [
    process.env.ANVIK_DATA_DIR,
    process.env.ANVIK_DATA_DIR === "" ? undefined : DEFAULT_DATA_DIR,
    path.join(process.env.TMPDIR ?? "/tmp", "anvik-data"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const dir of candidates) {
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, ".write-probe");
      writeFileSync(probe, "");
      return path.join(dir, "db.json");
    } catch {
      /* read-only or unwritable: try the next candidate */
    }
  }
  return null; // memory-only; this is the normal path on Vercel
}

let dbFileResolved = false;
let dbFile: string | null = null;

function dbFileOrNull(): string | null {
  if (!dbFileResolved) {
    dbFile = resolveDbFile();
    dbFileResolved = true;
  }
  return dbFile;
}

/** Write-through to disk. Silent no-op when the filesystem is read-only. */
function persist(db: DB) {
  const file = dbFileOrNull();
  if (!file) return;
  try {
    writeFileSync(file, JSON.stringify(db));
  } catch {
    /* disk went away mid-flight: memory stays authoritative */
  }
}

/* ---------------- seed ---------------- */

/** IST calendar day. The quota is a product promise to Indian users, so the
 *  reset must happen at midnight IST — a UTC key put it at 05:30 IST.
 *  One helper for *both* callers: using a UTC date for stored answers and an
 *  IST date for "today" made the spend ceiling read 0 after 18:30 UTC. */
const IST_OFFSET_MS = 5.5 * 3600_000;
function istDay(at: number = Date.now()): string {
  return new Date(at + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function dayKey(): string {
  return istDay();
}

function seed(): DB {
  const db: DB = { questions: [], answers: [], quota: {}, moderation: [], idempotency: {} };
  const now = Date.now();
  CORPUS.forEach((entry: CorpusEntry, i: number) => {
    const slug = slugify(entry.questions.en);
    const qId = `q-seed-${entry.id}`;
    const aId = `a-seed-${entry.id}`;
    db.questions.push({
      id: qId,
      deviceId: "seed",
      text: entry.questions.en,
      lang: "en",
      slug,
      idempotencyKey: null,
      createdAt: now - (CORPUS.length - i) * 3600_000,
      status: "answered",
    });
    db.answers.push({
      id: aId,
      questionId: qId,
      body: entry.answers.en,
      model: "seed-corpus",
      promptTokens: 2270,
      outputTokens: estimateTokens(entry.answers.en),
      cachedTokens: 2200,
      costPaise: 12,
      latencyMs: 4200,
      isPublic: true,
      publishedAt: now - (CORPUS.length - i) * 3600_000,
      moderationState: "clean",
      reviewed: true,
      lang: "en",
      slug,
    });
  });
  return db;
}

function migrate(db: DB): DB {
  const questions = Array.isArray(db.questions) ? db.questions : [];
  const answers = (Array.isArray(db.answers) ? db.answers : []).map((a) => ({
    ...a,
    reviewed: a.reviewed ?? a.model === "seed-corpus",
  }));
  return {
    questions,
    answers,
    quota: db.quota && typeof db.quota === "object" ? db.quota : {},
    moderation: Array.isArray(db.moderation) ? db.moderation : [],
    idempotency: db.idempotency && typeof db.idempotency === "object" ? db.idempotency : {},
  };
}

function load(): DB {
  if (g.__anvikDb) return g.__anvikDb;
  const fresh = migrate(seed());
  g.__anvikDb = fresh;
  const file = dbFileOrNull();
  if (file && existsSync(file)) {
    try {
      g.__anvikDb = migrate(JSON.parse(readFileSync(file, "utf8")) as DB);
    } catch {
      /* corrupt file: keep the seed rather than crash the page */
    }
  }
  return g.__anvikDb;
}

/** Merge Supabase rows into the in-memory document (best-effort, at boot). */
async function hydrateFromSupabase(): Promise<void> {
  const db = load();
  if (db.answers.some((a) => a.model !== "seed-corpus")) return; // already hydrated

  const answers = await sbSelect<{
    id: string; question_id: string; body: string; model: string;
    prompt_tokens: number | null; output_tokens: number | null; cached_tokens: number | null;
    cost_paise: number | null; latency_ms: number | null; is_public: boolean | null;
    published_at: number; moderation_state: string | null; reviewed: boolean | null;
    lang: string | null; slug: string;
  }>("anvik_answers", "select=*&order=published_at.desc&limit=500");
  if (!answers) return;

  const questions = await sbSelect<{
    id: string; device_id: string; text: string; lang: string; slug: string | null;
    idempotency_key: string | null; created_at: number; status: string;
  }>("anvik_questions", "select=*&order=created_at.desc&limit=500");

  for (const q of questions ?? []) {
    if (db.questions.some((existing) => existing.id === q.id)) continue;
    db.questions.push({
      id: q.id,
      deviceId: q.device_id,
      text: q.text,
      lang: (q.lang as Lang) ?? "en",
      slug: q.slug,
      idempotencyKey: q.idempotency_key,
      createdAt: q.created_at,
      status: (q.status as QuestionRow["status"]) ?? "answered",
    });
  }
  for (const a of answers) {
    if (db.answers.some((existing) => existing.id === a.id)) continue;
    db.answers.push({
      id: a.id,
      questionId: a.question_id,
      body: a.body,
      model: a.model,
      promptTokens: a.prompt_tokens ?? 0,
      outputTokens: a.output_tokens ?? 0,
      cachedTokens: a.cached_tokens ?? 0,
      costPaise: a.cost_paise ?? 0,
      latencyMs: a.latency_ms ?? 0,
      isPublic: a.is_public ?? false,
      publishedAt: a.published_at,
      moderationState: (a.moderation_state as ModerationState) ?? "clean",
      reviewed: a.reviewed ?? false,
      lang: (a.lang as Lang) ?? "en",
      slug: a.slug,
    });
  }
}

const hydration: Promise<void> = supabaseEnabled()
  ? hydrateFromSupabase().catch(() => undefined)
  : Promise.resolve();

/** Single-writer mutex for this process. Postgres owns real concurrency. */
function withLock<T>(fn: () => T): Promise<T> {
  const prev = g.__anvikLock ?? Promise.resolve();
  const run = prev.then(() => fn());
  g.__anvikLock = run.catch(() => undefined);
  return run;
}

/** §7.1 planning factor: ~1.9 tokens per Devanagari word ≈ 0.61 tokens/char. */
export function estimateTokens(text: string): number {
  const deva = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const perChar = deva / Math.max(1, text.length) > 0.3 ? 0.61 : 0.28;
  return Math.ceil(text.length * perChar);
}

/** §7.2 cost formula at Flash-class prices, ₹95/$ (planning rate). */
export function estimateCostPaise(outputTokens: number, cachedTokens = 2200, uncachedIn = 70): number {
  const usd = (cachedTokens * 0.03 + uncachedIn * 0.3 + outputTokens * 2.5) / 1_000_000;
  return Math.max(1, Math.round(usd * 95 * 100));
}

/* ------------------------------------------------------------------ */

export const store = {
  /** Wait for an optional Supabase hydration pass. Never rejects. */
  async ready(): Promise<void> {
    await hydration;
  },

  publicAnswers(): AnswerRow[] {
    return load()
      .answers.filter((a) => a.isPublic && a.moderationState !== "removed")
      .sort((a, b) => b.publishedAt - a.publishedAt);
  },

  /** Reviewed public answers joined to their question text, newest first.
   *  The gallery and the sitemap both show only these (owner spec, 21 Nov). */
  reviewedWithQuestions(): { answer: AnswerRow; question: string }[] {
    const db = load();
    return store
      .publicAnswers()
      .filter((a) => a.reviewed)
      .map((answer) => ({
        answer,
        question: db.questions.find((q) => q.id === answer.questionId)?.text ?? "",
      }));
  },

  /** Plan §7.4 control 1: model spend so far today, in paise. */
  todayCostPaise(): number {
    const day = dayKey();
    return load()
      .answers.filter((a) => istDay(a.publishedAt) === day)
      .reduce((sum, a) => sum + a.costPaise, 0);
  },

  /** Public answers joined to their question text, newest first. */
  publicWithQuestions(): { answer: AnswerRow; question: string }[] {
    const db = load();
    return store.publicAnswers().map((answer) => ({
      answer,
      question: db.questions.find((q) => q.id === answer.questionId)?.text ?? "",
    }));
  },

  bySlug(slug: string): AnswerRow | undefined {
    return load().answers.find((a) => a.slug === slug && a.moderationState !== "removed");
  },

  questionById(id: string): QuestionRow | undefined {
    return load().questions.find((q) => q.id === id);
  },

  questionRemaining(deviceId: string): number {
    const db = load();
    const entry = db.quota[deviceId];
    if (!entry || entry.day !== dayKey()) return FREE_DAILY;
    return entry.remaining;
  },

  /** Atomic check-and-set under the process lock: no TOCTOU (§6.2). */
  async decrementQuota(deviceId: string): Promise<number | null> {
    return withLock(() => {
      const db = load();
      const today = dayKey();
      let entry = db.quota[deviceId];
      if (!entry || entry.day !== today) entry = db.quota[deviceId] = { day: today, remaining: FREE_DAILY };
      if (entry.remaining <= 0) return null;
      entry.remaining -= 1;
      persist(db);
      return entry.remaining;
    });
  },

  async recordQuestion(row: Omit<QuestionRow, "id" | "createdAt">): Promise<QuestionRow> {
    const full = await withLock<QuestionRow>(() => {
      const db = load();
      const created: QuestionRow = { ...row, id: `q-${crypto.randomUUID()}`, createdAt: Date.now() };
      db.questions.push(created);
      persist(db);
      return created;
    });
    void sbInsert("anvik_questions", [{
      id: full.id, device_id: full.deviceId, text: full.text, lang: full.lang,
      slug: full.slug, idempotency_key: full.idempotencyKey,
      created_at: full.createdAt, status: full.status,
    }]);
    return full;
  },

  async recordAnswer(row: Omit<AnswerRow, "id" | "publishedAt">): Promise<AnswerRow> {
    const full = await withLock<AnswerRow>(() => {
      const db = load();
      const created: AnswerRow = { ...row, id: `a-${crypto.randomUUID()}`, publishedAt: Date.now() };
      db.answers.push(created);
      persist(db);
      return created;
    });
    void sbInsert("anvik_answers", [{
      id: full.id, question_id: full.questionId, body: full.body, model: full.model,
      prompt_tokens: full.promptTokens, output_tokens: full.outputTokens,
      cached_tokens: full.cachedTokens, cost_paise: full.costPaise, latency_ms: full.latencyMs,
      is_public: full.isPublic, published_at: full.publishedAt,
      moderation_state: full.moderationState, reviewed: full.reviewed,
      lang: full.lang, slug: full.slug,
    }]);
    return full;
  },

  async bindIdempotency(key: string, answerId: string): Promise<void> {
    return withLock(() => {
      const db = load();
      db.idempotency[key] = answerId;
      persist(db);
    });
  },

  idempotentAnswer(key: string): AnswerRow | undefined {
    const db = load();
    const id = db.idempotency[key];
    if (!id) return undefined;
    return db.answers.find((a) => a.id === id);
  },

  async logModeration(row: Omit<ModerationRow, "id" | "createdAt">): Promise<void> {
    return withLock(() => {
      const db = load();
      db.moderation.push({ ...row, id: `m-${crypto.randomUUID()}`, createdAt: Date.now() });
      persist(db);
    });
    void sbInsert("anvik_moderation", [{
      id: `m-${crypto.randomUUID()}`, question_text: row.questionText, stage: row.stage,
      reason_code: row.reasonCode, action: row.action, created_at: Date.now(),
    }]);
  },

  /** §4.3 duplicate check: normalised token-overlap, no embeddings. */
  findPublicMatch(question: string, threshold = 0.75): AnswerRow | undefined {
    const q = normTokens(question);
    if (q.size === 0) return undefined;
    const db = load();
    for (const a of store.publicAnswers()) {
      const qRow = db.questions.find((x) => x.id === a.questionId);
      if (!qRow) continue;
      const t = normTokens(qRow.text);
      if (t.size === 0) continue;
      let inter = 0;
      for (const tok of q) if (t.has(tok)) inter++;
      const overlap = inter / Math.min(q.size, t.size);
      if (overlap >= threshold) return a;
    }
    return undefined;
  },
};

const STOP = new Set([
  "kya","kaise","hai","hain","the","a","an","is","are","how","do","i","my","me","to",
  "for","what","should","ka","ki","karein","karun","kya","mein","se","ko","ka","ho",
]);

export function normTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9ऀ-ॿ\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP.has(t)),
  );
}

/** Corpus retrieval for demo mode: same overlap maths, looser threshold. */
export function corpusMatch(question: string, threshold = 0.34) {
  const corpus = CORPUS;
  const q = normTokens(question);
  let best: { entry: (typeof corpus)[number]; score: number } | null = null;
  for (const entry of corpus) {
    const pooled = new Set<string>();
    for (const variant of Object.values(entry.questions)) {
      for (const tok of normTokens(variant)) pooled.add(tok);
    }
    if (pooled.size === 0) continue;
    let inter = 0;
    for (const tok of q) if (pooled.has(tok)) inter++;
    const score = q.size ? inter / q.size : 0;
    if (score >= threshold && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}
