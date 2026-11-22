"use client";

import { Fragment, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

type Block =
  | { kind: "code"; lang: string; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "p"; text: string };

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^\s*```(\S*)\s*$/);
    if (fence) {
      const lang = fence[1] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ kind: "code", lang, text: body.join("\n") });
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", text: body.join("\n") });
      continue;
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s{0,3}#{1,6}\s/.test(lines[i]) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) blocks.push({ kind: "p", text: para.join("\n") });
    else i += 1;
  }

  return blocks;
}

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "switch",
  "case", "break", "continue", "import", "from", "export", "default", "async", "await",
  "try", "catch", "finally", "throw", "new", "class", "extends", "type", "interface",
  "enum", "def", "elif", "lambda", "pass", "yield", "with", "as", "in", "not", "and",
  "or", "True", "False", "None", "true", "false", "null", "undefined", "SELECT", "FROM",
  "WHERE", "INSERT", "UPDATE", "DELETE", "CREATE", "TABLE", "JOIN", "ON", "ORDER", "BY",
  "GROUP", "LIMIT", "AS", "print", "console",
]);

function highlightLine(line: string, lineKey: string): ReactNode[] {
  const tokenRe =
    /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|<\/?[A-Za-z][A-Za-z0-9-]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b(?=\s*\()|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRe.exec(line)) !== null) {
    if (match.index > last) {
      parts.push(line.slice(last, match.index));
    }
    const tok = match[0];
    const k = `${lineKey}-${idx++}`;
    if (tok.startsWith("//") || tok.startsWith("#") || tok.startsWith("/*")) {
      parts.push(<span key={k} className="tok-com">{tok}</span>);
    } else if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith("`")) {
      parts.push(<span key={k} className="tok-str">{tok}</span>);
    } else if (tok.startsWith("<")) {
      parts.push(<span key={k} className="tok-tag">{tok}</span>);
    } else if (/^\d/.test(tok)) {
      parts.push(<span key={k} className="tok-num">{tok}</span>);
    } else if (KEYWORDS.has(tok)) {
      parts.push(<span key={k} className="tok-kw">{tok}</span>);
    } else if (line.slice(match.index + tok.length).trimStart().startsWith("(")) {
      parts.push(<span key={k} className="tok-fn">{tok}</span>);
    } else {
      parts.push(tok);
    }
    last = match.index + tok.length;
  }

  if (last < line.length) {
    parts.push(line.slice(last));
  }
  return parts;
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore clipboard refusal */
    }
  }

  const lines = text.split("\n");

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[#EDEDED] bg-[#F7F7F5]">
      <div className="flex items-center justify-between border-b border-[#EDEDED] bg-white px-3.5 py-2 text-xs text-[#666666]">
        <span className="font-mono uppercase tracking-wider text-[#D97757]">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEDED] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1A1A1A] transition hover:bg-[#F7F7F5]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed text-[#1A1A1A]">
        <code>
          {lines.map((line, i) => (
            <Fragment key={`cl-${i}`}>
              {i > 0 && "\n"}
              {highlightLine(line, `cl-${i}`)}
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${n++}`;
    if (token.startsWith("`")) {
      out.push(<code key={key} className="md-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (/^https?:\/\//.test(token)) {
      out.push(
        <a key={key} href={token} target="_blank" rel="noreferrer noopener">{token}</a>,
      );
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text, className = "md" }: { text: string; className?: string }) {
  if (!text) return null;
  const blocks = parse(text);
  const nodes: ReactNode[] = blocks.map((block, index) => {
    const key = `b-${index}`;
    switch (block.kind) {
      case "code":
        return <CodeBlock key={key} lang={block.lang} text={block.text} />;
      case "heading": {
        const Tag = (`h${Math.min(block.level + 2, 6)}`) as "h3" | "h4" | "h5" | "h6";
        return <Tag key={key} className="md-h">{inline(block.text, key)}</Tag>;
      }
      case "ul":
        return (
          <ul key={key} className="md-ul">
            {block.items.map((item, i) => <li key={`${key}-${i}`}>{inline(item, `${key}-${i}`)}</li>)}
          </ul>
        );
      case "ol":
        return (
          <ol key={key} className="md-ol">
            {block.items.map((item, i) => <li key={`${key}-${i}`}>{inline(item, `${key}-${i}`)}</li>)}
          </ol>
        );
      case "quote":
        return <blockquote key={key} className="md-quote">{inline(block.text, key)}</blockquote>;
      case "rule":
        return <hr key={key} className="md-rule" />;
      default:
        return (
          <p key={key} className="md-p">
            {block.text.split("\n").map((line, i) => (
              <Fragment key={`${key}-${i}`}>
                {i > 0 && <br />}
                {inline(line, `${key}-${i}`)}
              </Fragment>
            ))}
          </p>
        );
    }
  });

  return <div className={className}>{nodes}</div>;
}

export function PlainText({ text }: { text: string }) {
  return <>{text.split("\n").map((line, i) => (
    <Fragment key={`l-${i}`}>
      {i > 0 && <br />}
      {inline(line, `l-${i}`)}
    </Fragment>
  ))}</>;
}
