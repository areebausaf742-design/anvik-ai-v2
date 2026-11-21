/**
 * ANVIK learning — what the product remembers about *you*, and from you.
 *
 * Two stores, both in the browser:
 *   anvik-memory    name, preferred language, preferred answer style
 *   anvik-learning  likes, dislikes, and the corrections typed after a dislike
 *
 * What this file explicitly does NOT do is choose answers. Feedback is a record,
 * not a lookup: a liked or corrected answer is never replayed in place of a
 * fresh one from Gemini. Both were removed because a match by normalised text is
 * not a match by meaning — "what is car?" must reach the model even if something
 * similar was liked last week.
 *
 * Memory is the one thing that reaches the model: `memoryInstruction()` is a
 * single prompt line about the user's name, language and preferred length.
 * Nothing here is required for the app to work; a browser with localStorage
 * disabled still gets every answer from Gemini.
 *
 * Privacy: text passes through `redact()` before it is written anywhere. Keys,
 * passwords, phone numbers, Aadhaar and card numbers never enter the store —
 * neither localStorage nor the optional Supabase mirror.
 */

import { detectLanguage, type Lang } from "./detect";

export const MEMORY_KEY = "anvik-memory";
export const LEARNING_KEY = "anvik-learning";

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */

export type Style = "short" | "detailed" | "coder";

export type Memory = {
  name: string;
  lang: Lang;
  style: Style;
  updatedAt: number;
};

export const DEFAULT_MEMORY: Memory = { name: "", lang: "en", style: "short", updatedAt: 0 };

export type Verdict = "like" | "dislike";

export type Feedback = {
  id: string;
  question: string;
  answer: string;
  verdict: Verdict;
  lang: Lang;
  topic: string;
  createdAt: number;
};

export type Correction = {
  id: string;
  question: string;
  answer: string;
  correction: string;
  lang: Lang;
  topic: string;
  createdAt: number;
};

export type Learning = {
  feedback: Feedback[];
  corrections: Correction[];
  updatedAt: number;
};

export const EMPTY_LEARNING: Learning = { feedback: [], corrections: [], updatedAt: 0 };

/* ------------------------------------------------------------------ */
/* privacy filter                                                      */
/* ------------------------------------------------------------------ */

const PATTERNS: { re: RegExp; replace: string; what: string }[] = [
  // provider keys
  { re: /\bAIza[0-9A-Za-z_-]{20,}\b/g, replace: "[key removed]", what: "api key" },
  { re: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replace: "[key removed]", what: "api key" },
  { re: /\b(?:ghp|gho|ghs)_[A-Za-z0-9]{20,}\b/g, replace: "[key removed]", what: "api key" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, replace: "[key removed]", what: "api key" },
  { re: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, replace: "Bearer [token removed]", what: "token" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replace: "[token removed]", what: "token" },
  // passwords and secrets written as key: value
  {
    re: /\b(password|passwd|pwd|passcode|pass|secret|api[_-]?key|token)\b\s*(?::|=|\bis\b|\bwas\b)\s*\S+/gi,
    replace: "$1: [removed]",
    what: "password",
  },
  // Indian mobile numbers, with or without country code
  { re: /(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/g, replace: "[phone removed]", what: "phone" },
  { re: /\b\d{5}[\s-]\d{5}\b/g, replace: "[phone removed]", what: "phone" },
  // Aadhaar (12 digits, often spaced in threes) and long card numbers
  { re: /\b\d{4}\s\d{4}\s\d{4}\b/g, replace: "[id removed]", what: "id" },
  { re: /\b(?:\d[ -]?){13,16}\b/g, replace: "[card removed]", what: "card" },
];

export type Redaction = { text: string; removed: string[] };

/**
 * Remove secrets and personal identifiers from anything bound for a store.
 * Returns which categories were stripped so the UI can say so out loud.
 */
export function redact(input: string): Redaction {
  let text = input ?? "";
  const removed = new Set<string>();
  for (const { re, replace, what } of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) removed.add(what);
    re.lastIndex = 0;
    text = text.replace(re, replace);
  }
  return { text, removed: [...removed] };
}

/** True when the text looks like it contains a secret — used to refuse loudly. */
export function containsSecret(input: string): boolean {
  return redact(input).removed.length > 0;
}

/* ------------------------------------------------------------------ */
/* normalisation and topics                                            */
/* ------------------------------------------------------------------ */

export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

const TOPIC_STOP = new Set([
  "the", "and", "for", "how", "what", "why", "can", "you", "your", "with", "this",
  "that", "from", "have", "does", "did", "was", "were", "are", "not", "but", "please",
  "kya", "kaise", "hai", "hain", "kar", "ka", "ki", "ko", "se", "mein", "mera", "meri",
  "mujhe", "aap", "tum", "batao", "bata", "chahiye", "karo", "karein",
]);

/** The two or three words that best name what a question is about. */
export function topicsOf(question: string): string[] {
  const words = normalizeQuestion(question)
    .split(" ")
    .filter((word) => word.length > 2 && !TOPIC_STOP.has(word));
  return [...new Set(words)].slice(0, 3);
}

export function topicOf(question: string): string {
  return topicsOf(question)[0] ?? "general";
}

/* ------------------------------------------------------------------ */
/* storage (client)                                                    */
/* ------------------------------------------------------------------ */

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // quota or a blocked store: the feature degrades, the app keeps working
    return false;
  }
}

export function readMemory(): Memory {
  const raw = readJson<Partial<Memory>>(MEMORY_KEY, {});
  return {
    name: typeof raw.name === "string" ? raw.name.slice(0, 40) : "",
    lang: raw.lang === "hi" || raw.lang === "hi-Latn" || raw.lang === "en" ? raw.lang : "en",
    style: raw.style === "detailed" || raw.style === "coder" || raw.style === "short" ? raw.style : "short",
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

export function writeMemory(next: Partial<Memory>): Memory {
  const merged: Memory = { ...readMemory(), ...next, updatedAt: Date.now() };
  writeJson(MEMORY_KEY, merged);
  return merged;
}

export function clearMemory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MEMORY_KEY);
  } catch {
    /* ignore */
  }
}

export function readLearning(): Learning {
  const raw = readJson<Partial<Learning>>(LEARNING_KEY, {});
  return {
    feedback: Array.isArray(raw.feedback) ? raw.feedback.filter(isFeedback) : [],
    corrections: Array.isArray(raw.corrections) ? raw.corrections.filter(isCorrection) : [],
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

function isFeedback(value: unknown): value is Feedback {
  const item = value as Feedback;
  return Boolean(item && typeof item.question === "string" && (item.verdict === "like" || item.verdict === "dislike"));
}

function isCorrection(value: unknown): value is Correction {
  const item = value as Correction;
  return Boolean(item && typeof item.question === "string" && typeof item.correction === "string");
}

function writeLearning(next: Learning): Learning {
  const capped: Learning = {
    ...next,
    feedback: next.feedback.slice(-200),
    corrections: next.corrections.slice(-100),
    updatedAt: Date.now(),
  };
  writeJson(LEARNING_KEY, capped);
  return capped;
}

export function clearLearning(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEARNING_KEY);
    // Older builds kept an answer cache here; remove it so nothing stale can
    // ever be mistaken for an answer again.
    window.localStorage.removeItem("anvik-cache");
  } catch {
    /* ignore */
  }
}

function id(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type FeedbackInput = {
  question: string;
  answer: string;
  verdict: Verdict;
  /** optional reply id, so a repeated tap toggles instead of duplicating */
  messageId?: string;
};

/** Record a like or dislike. Returns the changed store, plus what was redacted. */
export function recordFeedback(input: FeedbackInput): { learning: Learning; redacted: string[] } {
  const question = redact(input.question);
  const answer = redact(input.answer);
  const learning = readLearning();
  const normalized = normalizeQuestion(question.text);
  const existing = learning.feedback.findIndex(
    (item) => normalizeQuestion(item.question) === normalized && item.verdict === input.verdict,
  );

  if (existing !== -1) {
    // same verdict twice on the same question cancels it
    learning.feedback.splice(existing, 1);
    return {
      learning: writeLearning(learning),
      redacted: [...question.removed, ...answer.removed],
    };
  }

  // switching from like to dislike should not leave both behind
  learning.feedback = learning.feedback.filter((item) => normalizeQuestion(item.question) !== normalized);

  learning.feedback.push({
    id: id(),
    question: question.text,
    answer: answer.text,
    verdict: input.verdict,
    lang: detectLanguage(question.text),
    topic: topicOf(question.text),
    createdAt: Date.now(),
  });

  return { learning: writeLearning(learning), redacted: [...question.removed, ...answer.removed] };
}

/** Save "what I should have said" after a dislike. */
export function recordCorrection(input: {
  question: string;
  answer: string;
  correction: string;
}): { learning: Learning; redacted: string[] } {
  const question = redact(input.question);
  const answer = redact(input.answer);
  const correction = redact(input.correction);
  const learning = readLearning();

  learning.corrections.push({
    id: id(),
    question: question.text,
    answer: answer.text,
    correction: correction.text,
    lang: detectLanguage(question.text),
    topic: topicOf(question.text),
    createdAt: Date.now(),
  });

  return {
    learning: writeLearning(learning),
    redacted: [...new Set([...question.removed, ...answer.removed, ...correction.removed])],
  };
}

/* ------------------------------------------------------------------ */
/* optional server mirror                                              */
/* ------------------------------------------------------------------ */

/**
 * Best-effort copy of a like, dislike or correction to the server.
 *
 * The product has no accounts, so this only runs when the deployment has
 * Supabase configured; the route answers 202 and nothing happens otherwise.
 * Failures are swallowed: a sync problem must never interrupt the user.
 */
export function mirrorLearning(input: {
  verdict: Verdict | "correction";
  question: string;
  answer: string;
  correction?: string;
  mode?: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    const question = redact(input.question).text;
    const answer = redact(input.answer).text;
    const correction = redact(input.correction ?? "").text;
    const deviceId = window.localStorage.getItem("anvik-device-id") ?? "anonymous";
    void fetch("/api/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anvik-device": deviceId },
      body: JSON.stringify({
        deviceId,
        verdict: input.verdict,
        question,
        answer,
        correction,
        mode: input.mode ?? "smart",
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* storage blocked — the local copy is still written */
  }
}

/* ------------------------------------------------------------------ */
/* prompt injection                                                   */
/* ------------------------------------------------------------------ */

const LANG_TEXT: Record<Lang, string> = {
  hi: "Devanagari Hindi",
  "hi-Latn": "Hinglish (Hindi in Roman script)",
  en: "English",
};

const STYLE_TEXT: Record<Style, string> = {
  short: "Keep answers short — two or three sentences unless steps are required.",
  detailed: "Give a full answer with numbered steps and the official source named.",
  coder: "Prefer code and precise technical detail; skip pleasantries.",
};

/**
 * The one-line memory instruction added to every system prompt. Empty string
 * when the user has told us nothing, so a fresh install sends nothing extra.
 */
export function memoryInstruction(memory: Memory = readMemory()): string {
  const parts: string[] = [];
  if (memory.name.trim()) parts.push(`The user's name is ${memory.name.trim()}; use it once, not every sentence.`);
  if (memory.lang !== "en" || memory.updatedAt > 0) {
    parts.push(`User prefers ${LANG_TEXT[memory.lang]}.`);
  }
  parts.push(STYLE_TEXT[memory.style]);
  return `What you remember about this user: ${parts.join(" ")}`;
}

/* ------------------------------------------------------------------ */
/* dashboard                                                          */
/* ------------------------------------------------------------------ */

export type LearningStats = {
  likes: number;
  dislikes: number;
  corrections: number;
  topTopics: { topic: string; count: number }[];
  bestReplies: { question: string; answer: string; at: number }[];
};

export function learningStats(learning: Learning = readLearning()): LearningStats {
  const counts = new Map<string, number>();
  for (const item of [...learning.feedback, ...learning.corrections]) {
    const topic = item.topic || topicOf(item.question);
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  const topTopics = [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, 5);

  const bestReplies = [...learning.feedback]
    .filter((item) => item.verdict === "like")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3)
    .map((item) => ({ question: item.question, answer: item.answer, at: item.createdAt }));

  return {
    likes: learning.feedback.filter((item) => item.verdict === "like").length,
    dislikes: learning.feedback.filter((item) => item.verdict === "dislike").length,
    corrections: learning.corrections.length,
    topTopics,
    bestReplies,
  };
}
