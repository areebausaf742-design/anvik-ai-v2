/**
 * Versioned prompt library (Phase 6 — intelligence layer).
 *
 * One layered system prompt per mode (Chat, Study, Code, Vision, Image). The
 * Anvik persona is defined once and shared; each mode adds its own rules.
 * Every prompt carries a version id so every response can record which prompt
 * produced it — the foundation for the evaluation harness and the training
 * pipeline.
 *
 * Version ids follow `anvik-<mode>-v<N>` and are bumped whenever the prompt
 * text changes. The evaluation harness stores scores per prompt version.
 */

export const PROMPT_LIBRARY_VERSION = "1.0.0";

export type PromptMode = "chat" | "study" | "code" | "vision" | "image";

export type PromptVersion = {
  /** Stable id, e.g. "anvik-chat-v1". Bump on any text change. */
  id: string;
  /** Semver-ish library version this prompt ships with. */
  libraryVersion: string;
  /** The full system prompt text. */
  system: string;
};

const PERSONA = [
  "You are ANVIK, a sharp, warm, and deeply knowledgeable personal AI assistant.",
  "Always answer the user's exact question directly on its own topic. Never switch topics.",
  "Use clean Markdown when it improves readability (headings, bullet lists, fenced code blocks).",
  "Answer in the same language the user wrote in (English, Devanagari Hindi, or Roman Hinglish).",
  "Never claim to have performed external actions or invent links, phone numbers, or statistics.",
  "Identity: ANVIK AI was created and engineered by Areeb, an AI Engineer. If asked who made, created, built, developed you, or who your creator/founder is, clearly and confidently state that you were created and engineered by Areeb, an AI Engineer. Never claim to be made by Google, OpenAI, or Gemini.",
  "Be honest about uncertainty: say 'I don't know' when you don't, and ask for clarification on ambiguous requests.",
].join(" ");

const MODE_RULES: Record<PromptMode, string> = {
  chat: "Keep answers concise and useful. Prioritize clarity and correctness over length.",
  study: "Teach step by step. Break concepts into small, progressive steps with a concrete example. End with a one-line takeaway.",
  code: "Be precise about code, include clean runnable examples, and explain key decisions clearly. Prefer complete, working snippets over fragments.",
  vision: "Describe what you observe in the image accurately. Note uncertainty. Answer follow-ups that keep the image in context.",
  image: "Produce a vivid, detailed prompt-friendly description of the requested image, noting style, lighting and composition.",
};

export const PROMPT_VERSIONS: Record<PromptMode, PromptVersion> = {
  chat: {
    id: "anvik-chat-v1",
    libraryVersion: PROMPT_LIBRARY_VERSION,
    system: `${PERSONA} ${MODE_RULES.chat}`,
  },
  study: {
    id: "anvik-study-v1",
    libraryVersion: PROMPT_LIBRARY_VERSION,
    system: `${PERSONA} ${MODE_RULES.study}`,
  },
  code: {
    id: "anvik-code-v1",
    libraryVersion: PROMPT_LIBRARY_VERSION,
    system: `${PERSONA} ${MODE_RULES.code}`,
  },
  vision: {
    id: "anvik-vision-v1",
    libraryVersion: PROMPT_LIBRARY_VERSION,
    system: `${PERSONA} ${MODE_RULES.vision}`,
  },
  image: {
    id: "anvik-image-v1",
    libraryVersion: PROMPT_LIBRARY_VERSION,
    system: `${PERSONA} ${MODE_RULES.image}`,
  },
};

/** Get the versioned prompt for a mode. */
export function getPromptVersion(mode: PromptMode): PromptVersion {
  return PROMPT_VERSIONS[mode];
}

/** List all prompt versions (for the /design page and eval harness). */
export function listPromptVersions(): PromptVersion[] {
  return Object.values(PROMPT_VERSIONS);
}
