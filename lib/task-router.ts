/**
 * Task router (Phase 6 — intelligence layer).
 *
 * Classifies a user request into a task type and picks the best model + settings
 * automatically. The user's manual model choice (mode: fast/smart/creative/coder)
 * is honored as an override; when absent, the router decides.
 *
 * Task types: casual, factual, reasoning, coding, study, vision, image.
 * Output: { task, temperature, maxOutputTokens, needsSearch }.
 */

export type TaskType =
  | "casual"
  | "factual"
  | "reasoning"
  | "coding"
  | "study"
  | "vision"
  | "image";

export type RouteDecision = {
  task: TaskType;
  temperature: number;
  maxOutputTokens: number;
  needsSearch: boolean;
};

const CODING_HINTS = /\b(code|function|class|script|program|debug|refactor|api|sql|python|javascript|typescript|java|react|component|bug|compile|syntax|algorithm)\b/i;
const STUDY_HINTS = /\b(explain|teach|learn|study|understand|concept|how does|why does|tutorial|example)\b/i;
const REASONING_HINTS = /\b(analyze|compare|evaluate|reason|think|plan|design|strategy|tradeoff|pros and cons)\b/i;
const FACTUAL_HINTS = /\b(what is|when|where|who|how much|price|fee|date|official|government|scheme|policy|rule)\b/i;
const CASUAL_HINTS = /^(hi|hii|hello|hey|thanks|thank you|ok|okay|bye|good morning|good night)\b/i;

export function classifyTask(text: string, hasImage = false, hasCode = false): TaskType {
  const t = text.trim();
  if (hasImage) return "vision";
  if (hasCode) return "coding";
  if (CASUAL_HINTS.test(t)) return "casual";
  if (CODING_HINTS.test(t)) return "coding";
  if (STUDY_HINTS.test(t)) return "study";
  if (REASONING_HINTS.test(t)) return "reasoning";
  if (FACTUAL_HINTS.test(t)) return "factual";
  return "reasoning";
}

export function routeTask(text: string, hasImage = false, hasCode = false): RouteDecision {
  const task = classifyTask(text, hasImage, hasCode);
  switch (task) {
    case "casual":
      return { task, temperature: 0.7, maxOutputTokens: 256, needsSearch: false };
    case "factual":
      return { task, temperature: 0.3, maxOutputTokens: 512, needsSearch: true };
    case "reasoning":
      return { task, temperature: 0.6, maxOutputTokens: 1024, needsSearch: false };
    case "coding":
      return { task, temperature: 0.3, maxOutputTokens: 2048, needsSearch: false };
    case "study":
      return { task, temperature: 0.5, maxOutputTokens: 1024, needsSearch: false };
    case "vision":
      return { task, temperature: 0.4, maxOutputTokens: 1024, needsSearch: false };
    case "image":
      return { task, temperature: 0.7, maxOutputTokens: 512, needsSearch: false };
  }
}
