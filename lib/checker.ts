/**
 * ANVIK safety check — the only thing between Gemini and the user.
 *
 * It does three things and nothing else:
 *   1. empty     — an answer with no words is a failure
 *   2. abuse     — insulting or threatening wording is refused
 *   3. helpline  — a phone number presented as a helpline must be real
 *
 * It does NOT rewrite the answer, add a footer, translate it, or replace it
 * with text on another topic. An earlier version "repaired" answers by
 * stripping links, domains, statistics and numbers; that made the product look
 * authoritative while quietly changing what the model said. Topical mistakes
 * are the model's to make and the model's to fix — never a template's.
 *
 * The two exceptions above are deliberate: abuse is not an answer we pass on,
 * and an invented helpline number can cost someone money or a life, so it is
 * replaced with a pointer to the real list (`REAL_HELPLINES`, which mirrors
 * lib/corpus.ts and is kept in sync by a test).
 */

export const CHECK_TRAILER = "\u2063ANVIK_CHECK:";

/**
 * Helpline numbers that actually exist, from lib/corpus.ts:
 *   Tele-MANAS 14416 · iCall 9152987821 · Emergency 108
 *   Cyber 1930 · PM-KISAN 155261 / 011-24300606 · Childline 1098
 */
export const REAL_HELPLINES = ["14416", "9152987821", "108", "1930", "155261", "01124300606", "112", "181", "1098"];

const ABUSE = [
  "idiot", "stupid", "moron", "shut up", "useless piece", "kill your",
  "chutiya", "gadha", "bewakoof", "saale", "harami",
];

/** Words that mark the digits beside them as a phone number. */
const HELPLINE_CONTEXT =
  /(call|helpline|help line|contact|toll[- ]?free|phone|dial|number|संपर्क|हेल्पलाइन|फ़ोन|नंबर|कॉल)/i;

export type IssueCode = "empty" | "safety" | "helpline";

export type Issue = {
  code: IssueCode;
  message: string;
  severity: "blocking" | "fixable";
};

export type CheckResult = {
  ok: boolean;
  issues: Issue[];
  /** the answer as returned; identical to the input unless a helpline was replaced */
  repaired: string;
  changed: boolean;
  note: string;
};

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function isReal(value: string): boolean {
  return REAL_HELPLINES.some((real) => value === real || value.endsWith(real));
}

/**
 * Numbers that look like helplines but are not on the real list.
 *
 * Only two shapes stand alone: a 1800 toll-free number and a ten-digit mobile.
 * Anything else needs a helpline word nearby, so "₹50,000" and "around 40000
 * people" are read as money and counts, not phone numbers.
 */
export function suspiciousPhonelike(text: string): string[] {
  const found: string[] = [];
  const strong = /(?:\+91[\s-]?)?(?:1800[\s-]?\d{3}[\s-]?\d{3,4}|\b[6-9]\d{9}\b)/g;
  for (const match of text.matchAll(strong)) {
    if (!isReal(digits(match[0]))) found.push(match[0].trim());
  }

  const weak = /\b\d[\d\s-]{4,}\d\b/g;
  for (const match of text.matchAll(weak)) {
    const value = digits(match[0]);
    if (value.length < 5 || value.length > 13) continue;
    if (isReal(value)) continue;
    if (/^\d{4}$/.test(value) && Number(value) > 1900 && Number(value) < 2100) continue;
    const start = Math.max(0, (match.index ?? 0) - 60);
    const context = text.slice(start, (match.index ?? 0) + match[0].length + 20);
    if (!HELPLINE_CONTEXT.test(context)) continue;
    if (found.includes(match[0].trim())) continue;
    found.push(match[0].trim());
  }
  return found;
}

/** Replace an invented helpline with a pointer to the real one. */
function repairHelplines(text: string): { text: string; removed: number } {
  let removed = 0;
  const out = text.replace(
    /(?:\+91[\s-]?)?(?:1800[\s-]?\d{3}[\s-]?\d{3,4}|\b\d{3,5}[- ]\d{6,8}\b)/g,
    (raw) => {
      if (isReal(digits(raw))) return raw;
      removed += 1;
      return "the official helpline listed on the department's page";
    },
  );
  return { text: out, removed };
}

/** The refusal shown when an answer turns out to be abusive. */
export function abuseReply(): string {
  return "I won't continue with that answer — it turned abusive. Ask again and I'll keep it respectful and to the point.";
}

/**
 * Check a finished answer. `ok` means "safe to show as written".
 * `repaired` differs from the input only when a helpline number was replaced.
 */
export function checkReply(reply: string): CheckResult {
  const original = reply ?? "";

  if (!original.trim()) {
    return {
      ok: false,
      issues: [{ code: "empty", message: "The answer was empty.", severity: "blocking" }],
      repaired: "",
      changed: false,
      note: "No answer came back.",
    };
  }

  const issues: Issue[] = [];
  let text = original;

  const lowered = text.toLowerCase();
  if (ABUSE.some((word) => lowered.includes(word))) {
    issues.push({ code: "safety", message: "The answer used abusive language.", severity: "blocking" });
  }

  const helplines = repairHelplines(text);
  if (helplines.removed > 0) {
    text = helplines.text;
    issues.push({
      code: "helpline",
      message: "A phone number that is not a real helpline was replaced.",
      severity: "fixable",
    });
  }

  if (issues.length === 0 && suspiciousPhonelike(text).length > 0) {
    issues.push({
      code: "helpline",
      message: "An unverified phone number is present.",
      severity: "fixable",
    });
  }

  const blocking = issues.some((issue) => issue.severity === "blocking");
  return {
    ok: issues.length === 0,
    issues,
    repaired: text,
    changed: text !== original,
    note: issues.length === 0
      ? "Checked: not empty, no abuse, helpline numbers real."
      : blocking
        ? "The answer did not pass the safety check."
        : issues.map((issue) => issue.message).join(" "),
  };
}

/* ------------------------------------------------------------------ */
/* trailer plumbing (shared by the route and the client)               */
/* ------------------------------------------------------------------ */

export type DecodedCheck = {
  ok: boolean;
  issues: { code: IssueCode; message: string; severity: "blocking" | "fixable" }[];
  note: string;
  changed: boolean;
};

export function encodeCheck(result: CheckResult): string {
  return `${CHECK_TRAILER}${JSON.stringify({
    ok: result.ok,
    issues: result.issues.map(({ code, message, severity }) => ({ code, message, severity })),
    note: result.note,
    changed: result.changed,
  })}`;
}

/** Split a completed reply into the visible answer and its safety verdict. */
export function decodeCheck(full: string): { text: string; check: DecodedCheck | null } {
  const index = full.lastIndexOf(CHECK_TRAILER);
  if (index === -1) return { text: full, check: null };
  const text = full.slice(0, index).replace(/\s+$/, "");
  const raw = full.slice(index + CHECK_TRAILER.length).trim();
  try {
    const parsed = JSON.parse(raw) as DecodedCheck;
    if (typeof parsed?.ok !== "boolean") return { text, check: null };
    return { text, check: parsed };
  } catch {
    return { text, check: null };
  }
}
