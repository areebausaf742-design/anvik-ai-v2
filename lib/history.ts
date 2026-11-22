/**
 * Conversation history → Gemini contents.
 *
 * The Gemini `contents` contract is strict and positional:
 *   [{role:"user", parts:[{text:...}]}, {role:"model", parts:[{text:...}]}, ...]
 *
 * The client owns the conversation and sends the full history each turn, so the
 * route must not trust its shape. This module is that one strict door:
 *
 *   1. only `user`/`assistant` roles with non-empty trimmed text pass
 *   2. one message cap (4000 chars) and a total-size cap (oldest dropped)
 *   3. trailing assistant turns are dropped — the model must never answer a
 *      message it already answered (no duplicated last message)
 *   4. consecutive same-role turns are merged into one user/model turn, so the
 *      history is well-formed for the API
 *   5. the last turn is always a user turn
 */

export const MAX_MESSAGE_CHARS = 4000;
export const MAX_HISTORY_MESSAGES = 40;
export const MAX_TOTAL_CHARS = 32_000;

import type { GeminiTurn } from "./gemini";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type SanitizeResult =
  | { ok: true; turns: ChatTurn[] }
  | { ok: false; error: string };

/** Strictly validate the client's conversation. Never throws. */
export function sanitizeTurns(input: unknown): SanitizeResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Send a valid JSON body with a messages array." };
  }
  if (input.length === 0) {
    return { ok: false, error: "A conversation is required." };
  }
  if (input.length > MAX_HISTORY_MESSAGES) {
    return { ok: false, error: `Send between 1 and ${MAX_HISTORY_MESSAGES} messages.` };
  }

  const turns: ChatTurn[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Each message must be an object with a role and a content string." };
    }
    const { role, content } = raw as { role: unknown; content: unknown };
    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: "Each message must be a user or assistant turn." };
    }
    if (typeof content !== "string") {
      return { ok: false, error: "Each message must have a content string." };
    }
    const trimmed = content.trim();
    if (!trimmed) {
      return { ok: false, error: "Prompt cannot be empty. Write a message and try again." };
    }
    if (trimmed.length > MAX_MESSAGE_CHARS) {
      return { ok: false, error: `Keep each message under ${MAX_MESSAGE_CHARS} characters.` };
    }
    turns.push({ role, content: trimmed });
  }
  return { ok: true, turns };
}

/**
 * Build a well-formed Gemini contents array from sanitized turns.
 * Returns [] when nothing usable remains (caller must 400).
 */
export function buildGeminiContents(turns: ChatTurn[]): GeminiTurn[] {
  // Drop trailing assistant turns: the conversation must end with the user.
  let working = [...turns];
  while (working.length > 0 && working[working.length - 1].role === "assistant") {
    working = working.slice(0, -1);
  }

  // Cap the number of messages (keep the newest — the answer depends on them).
  working = working.slice(-MAX_HISTORY_MESSAGES);

  // Cap the total size, dropping the oldest turns to keep the newest.
  let total = working.reduce((sum, turn) => sum + turn.content.length, 0);
  while (working.length > 1 && total > MAX_TOTAL_CHARS) {
    total -= working[0].content.length;
    working = working.slice(1);
  }
  // Merge consecutive same-role turns so roles alternate and never duplicate.
  const merged: ChatTurn[] = [];
  for (const turn of working) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${turn.content}`;
    } else {
      merged.push({ role: turn.role, content: turn.content });
    }
  }

  if (merged.length === 0 || merged[merged.length - 1].role !== "user") {
    return [];
  }

  return merged.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));
}

/** True when the contents end with a user turn (the API contract). */
export function contentsEndWithUser(contents: GeminiTurn[]): boolean {
  return contents.length > 0 && contents[contents.length - 1].role === "user";
}
