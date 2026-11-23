"use client";

import React from "react";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Globe } from "lucide-react";
import type { SearchSource, SearchStatus } from "@/lib/search";

/**
 * Expandable source previews for a web-searched answer.
 *
 * Everything shown here is what the server actually received from Gemini's
 * grounding metadata — titles, domains, links and the queries the model ran.
 * When grounding returns nothing, this panel says so honestly instead of
 * inventing sources. Publication dates are not available in grounding
 * metadata, so they are deliberately not shown.
 */
export default function SourcesPanel({
  sources,
  queries,
  searchStatus,
  defaultOpen = true,
}: {
  sources: SearchSource[];
  queries: string[];
  searchStatus: SearchStatus;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState<number | null>(null);

  const hasSources = sources.length > 0;
  const honest = searchStatus === "unavailable";

  if (searchStatus !== "on" && searchStatus !== "unavailable") return null;
  if (!hasSources && !queries.length && searchStatus === "on") {
    return null; // nothing to show, nothing to say
  }

  return (
    <div className="sources-panel mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="sources-head"
      >
        <span className="search-status-dot" aria-hidden="true" />
        <span className="text-xs font-semibold text-[#1A1A1A]">
          {honest ? "Search unavailable" : "Web search"}
        </span>
        {hasSources && (
          <span className="text-xs text-[#999999]">
            {sources.length} source{sources.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="ml-auto text-[#999999]" aria-hidden="true">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div className="sources-body">
          {honest && (
            <p className="rounded-xl border border-[#EDEDED] bg-[#F7F7F5] px-3.5 py-2.5 text-xs leading-relaxed text-[#666666]">
              Web search was requested but this time the web could not be used — the answer above was
              written directly by the model. Ask again or turn Web Search on.
            </p>
          )}

          {queries.length > 0 && (
            <div className="mb-2">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#999999]">
                Searched for
              </p>
              <div className="flex flex-wrap gap-1.5">
                {queries.map((query, i) => (
                  <span key={`${query}-${i}`} className="sources-chip">{query}</span>
                ))}
              </div>
            </div>
          )}

          {!hasSources && searchStatus === "on" && (
            <p className="text-xs leading-relaxed text-[#666666]">
              Search ran, but no sources were returned for this response.
            </p>
          )}

          {hasSources && (
            <ol className="sources-list">
              {sources.map((source, index) => {
                const isOpen = expanded === index;
                return (
                  <li key={`${source.uri}-${index}`} className="sources-item">
                    <div className="sources-row">
                      <span className="sources-index" aria-hidden="true">{index + 1}</span>
                      <span className="min-w-0 flex-1 text-left">
                        <a
                          href={source.uri}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="sources-title sources-title-link"
                        >
                          {source.title}
                        </a>
                        <span className="sources-domain">{source.domain}</span>
                        {source.provider && <span className="sources-provider">{source.provider}</span>}
                      </span>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`Expand source ${index + 1}`}
                        onClick={() => setExpanded(isOpen ? null : index)}
                        className="sources-toggle shrink-0 text-[#CCCCCC]"
                      >
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    {isOpen && (
                      <div className="sources-preview">
                        <p className="sources-preview-title">{source.title}</p>
                        {source.snippet && <p className="sources-preview-excerpt">{source.snippet}</p>}
                        <p className="sources-preview-url">
                          <Globe className="mr-1 inline h-3 w-3 align-[-2px] text-[#999999]" aria-hidden="true" />
                          {source.domain}
                        </p>
                        <a
                          href={source.uri}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="sources-open"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Open source
                        </a>
                        <p className="sources-preview-meta">{source.uri}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
