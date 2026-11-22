export const promptLibrary = [
  "Explain a hard topic simply",
  "Write a concise executive summary",
  "Debug this code step by step",
  "Brainstorm ten distinctive names",
  "Draft a warm, professional email",
  "Turn notes into an action plan",
  "Create a 30-day learning roadmap",
  "Review this idea for blind spots",
  "Write a product launch plan",
  "Summarize this for a busy reader",
  "Design a clear API contract",
  "Improve this paragraph without changing its voice",
  "Compare these options fairly",
  "Create a meeting agenda",
  "Write an engaging short story",
  "Generate test cases for this function",
  "Outline a persuasive presentation",
  "Break a goal into weekly milestones",
  "Suggest accessible UI improvements",
  "Translate jargon into plain language",
  "Create a customer interview guide",
  "Find the simplest next step",
  "Make this message more empathetic",
  "Teach me with a practical example",
];

export const modes = [
  { id: "fast", label: "Fast", hint: "Quick answers" },
  { id: "smart", label: "Smart", hint: "Deep thinking" },
  { id: "creative", label: "Creative", hint: "Fresh perspectives" },
  { id: "coder", label: "Coder", hint: "Code & logic" },
] as const;

export type ModeId = (typeof modes)[number]["id"];
