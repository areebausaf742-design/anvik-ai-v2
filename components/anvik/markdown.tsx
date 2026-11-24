"use client";

import React, { Children, Fragment, isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Check, Copy } from "lucide-react";

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
          aria-label={copied ? "Code copied" : `Copy ${lang || "code"}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDEDED] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1A1A1A] transition hover:bg-[#F7F7F5]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre tabIndex={0} className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed text-[#1A1A1A]">
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

const markdownComponents: Components = {
  a({ node: _node, href, children, ...props }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
        {children}
      </a>
    );
  },
  p({ node: _node, children }) {
    return <p className="md-p">{children}</p>;
  },
  ul({ node: _node, children }) {
    return <ul className="md-ul">{children}</ul>;
  },
  ol({ node: _node, children }) {
    return <ol className="md-ol">{children}</ol>;
  },
  blockquote({ node: _node, children }) {
    return <blockquote className="md-quote">{children}</blockquote>;
  },
  hr() {
    return <hr className="md-rule" />;
  },
  code({ node: _node, className, children, ...props }) {
    return (
      <code className={className ? `md-code-block ${className}` : "md-code"} {...props}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    const code = Children.toArray(children).find(isValidElement);
    if (!code) return <pre className="md-pre">{children}</pre>;

    const props = code.props as { className?: string; children?: ReactNode };
    const language = props.className?.match(/language-([^\s]+)/)?.[1] ?? "";
    const codeText = String(props.children ?? "").replace(/\n$/, "");
    return <CodeBlock lang={language} text={codeText} />;
  },
  table({ children }) {
    return (
      <div className="md-table-wrap">
        <table className="md-table">{children}</table>
      </div>
    );
  },
};

export default function Markdown({ text, className = "md" }: { text: string; className?: string }) {
  if (!text) return null;

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function PlainText({ text }: { text: string }) {
  return <>{text.split("\n").map((line, i) => (
    <Fragment key={`l-${i}`}>
      {i > 0 && <br />}
      {inline(line, `l-${i}`)}
    </Fragment>
  ))}</>;
}
