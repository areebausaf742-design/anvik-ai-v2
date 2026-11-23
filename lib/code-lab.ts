export const CODE_LAB_LANGUAGES = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Java",
  "HTML/CSS",
  "CSS",
  "SQL",
] as const;

export type CodeLabLanguage = (typeof CODE_LAB_LANGUAGES)[number];
export type ExtractedCodeBlock = {
  lang: string;
  code: string;
  matchesExpected: boolean;
};

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript", jsx: "javascript", javascript: "javascript",
  ts: "typescript", tsx: "typescript", typescript: "typescript",
  py: "python", python: "python", jav: "java", java: "java",
  html: "html", htm: "html", "html/css": "html", "html+css": "html",
  css: "css", sql: "sql",
};

export function normalizeCodeLanguage(value: string): string {
  const normalized=value.trim().toLowerCase().replace(/\s+/g, "");
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

export function getCodeFenceLanguage(language: string): string {
  return normalizeCodeLanguage(language === "HTML/CSS" ? "html" : language);
}

/** Select the requested-language block instead of blindly showing the first fence. */
export function extractCodeBlock(markdown: string, expectedLanguage: string): ExtractedCodeBlock {
  const expected=getCodeFenceLanguage(expectedLanguage);
  const fence = /```([^\s`]*)[^\r\n]*\r?\n([\s\S]*?)(?:```|$)/g;
  const blocks: RegExpExecArray[]=[];
  let match: RegExpExecArray | null;
  while ((match=fence.exec(markdown)) !== null) blocks.push(match);
  const selected=blocks.find((block) => normalizeCodeLanguage(block[1] ?? "") === expected) ?? blocks[0];
  if (!selected) return { lang:"", code:markdown.trim(), matchesExpected:false };
  const lang=(selected[1] ?? "").toLowerCase();
  return {
    lang,
    code:(selected[2] ?? "").trim(),
    matchesExpected:normalizeCodeLanguage(lang) === expected,
  };
}
