/**
 * Security primitives — key handling, IP hashing, prompt-injection scanning.
 *
 * Two non-negotiable rules live here:
 *   1. A Gemini key is never logged, echoed or returned. Only its last four
 *      characters are ever shown (maskKey), mainly for audit trails.
 *   2. History is screened for injection attempts that try to steal the system
 *      prompt or a key/secret. Blocked requests are refused before any model
 *      call is made.
 */

import { createHash } from "node:crypto";
import { redact } from "./learning";

/* ------------------------------------------------------------------ */
/* key handling                                                        */
/* ------------------------------------------------------------------ */

/** Show enough to recognise a key, never enough to use it. */
export function maskKey(key: string): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••••••${trimmed.slice(-4)}`;
}

/** Audit-safe log line for a key. Logs last 4 chars only — never the key. */
export function safeKeyLog(key: string): string {
  return key ? `anvik-key:${maskKey(key)}` : "anvik-key:(none)";
}

/* ------------------------------------------------------------------ */
/* IP hashing — quota and rate-limit identity                          */
/* ------------------------------------------------------------------ */

const IP_SALT = "anvik-v2-ip-salt";

/** Deterministic, salted hash of an IP so raw addresses never reach the DB. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${IP_SALT}:${ip}`).digest("hex");
}

/* ------------------------------------------------------------------ */
/* secret stripping                                                    */
/* ------------------------------------------------------------------ */

/**
 * Strip secrets and personal identifiers (API keys, passwords, Aadhaar,
 * phone numbers, card numbers) from anything about to be sent to the model.
 */
export function stripSecrets(text: string): { text: string; removed: string[] } {
  return redact(text);
}

/* ------------------------------------------------------------------ */
/* prompt-injection screening                                          */
/* ------------------------------------------------------------------ */

export type InjectionVerdict = { blocked: boolean; reason?: string };

/**
 * High-precision patterns whose only purpose is to steal the system prompt
 * or a key/secret, or to break the assistant out of its role. They are
 * deliberately strict — educational questions ("what is a system prompt?")
 * must keep passing, which is why every pattern requires an exfiltration or
 * override verb, never just a target word.
 */
const PATTERNS: { re: RegExp; reason: string }[] = [
  // Direct exfiltration: theft verb + target
  {
    re: /\b(steal|reveal|show|print|give|tell|dump|leak|expose|exfiltrate|extract|harvest|copy|list|display|repeat|provide|share|send|paste|read|output)\b[^.?]{0,90}?\b(system\s*prompt|system\s*instruction|system\s*message|(?:starter|hidden|secret|confidential|original|initial)\s*(?:prompt|instruction|message)|(?:api|private|secret|access|encryption|master|confidential)\s*(?:key|token|secret|password|credential|credentials)|(?:api|secret|private)\s*key|password|credentials?|key\s*value|api\s*key)\b/i,
    reason: "exfiltration of a key or system prompt",
  },
  // "what is/are your …" / "show me your …" targeting prompts or keys
  {
    re: /\b(what|show|tell|give|list|dump|leak|expose|reveal|read|output)\b[^.?]{0,60}?\b(your|the\s+system)\b[^.?]{0,80}?\b(system\s*prompt|system\s*instruction|instructions?|rules?|prompt|keys?|secrets?|passwords?|credentials?|api\s*key)\b/i,
    reason: "exfiltration of a key or system prompt",
  },
  // Override / ignoring instructions
  {
    re: /\b(ignore|disregard|forget|override|bypass|evade|disable|remove|skip|cancel)\b[^.?]{0,30}?\b(all|any|the|your|these|those|every)?\s*(previous|prior|above|earlier|initial|original|hidden|system)?\s*(instructions?|prompts?|rules?|guidelines?|constraints?|directives?|restrictions?|system\s*(prompt|instruction|message))/i,
    reason: "instruction override attempt",
  },
  // "ignore your system prompt and …" without the previous-style prefix
  {
    re: /\b(ignore|disregard|forget|override|bypass|evade)\b[^.?]{0,30}?\b(system|prompt|instruction|rules?|constraints?|guidelines?)\b[^.?]{0,60}?\b(and|so|then|now|finally)\b/i,
    reason: "instruction override attempt",
  },
  // Jailbreak / mode markers
  {
    re: /\b(jailbreak|dan\s*mode|developer\s*mode|unrestricted\s*ai|unrestricted\s*mode|god\s*mode|act\s+as\s+(an?\s+)?(unrestricted|unfiltered|uncensored|evil|dark)|pretend\s+(you\s+are|to\s+be)\s+(an?\s+)?(unrestricted|uncensored|unfiltered|evil|dark)|do\s+not\s+follow\s+(your|the)\s+(instructions?|rules?))\b/i,
    reason: "jailbreak attempt",
  },
  // Direct key/secret theft
  {
    re: /\b(copy|extract|steal|export|send|print|dump|leak|expose)\b\s+(?:the\s+)?(?:key|keys|secret|token|password|credentials?)\b/i,
    reason: "key or secret exfiltration",
  },
];

/**
 * Scan text for prompt-injection attempts. Returns the first matched reason
 * or null when the text is clean. Educational wording is not blocked.
 */
export function scanForInjection(text: string): InjectionVerdict {
  if (!text) return { blocked: false };
  for (const { re, reason } of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) return { blocked: true, reason };
  }
  return { blocked: false };
}

/** Scan every turn of the conversation. */
export function scanHistory(turns: { content: string }[]): InjectionVerdict {
  for (const turn of turns) {
    const verdict = scanForInjection(turn.content);
    if (verdict.blocked) return verdict;
  }
  return { blocked: false };
}
