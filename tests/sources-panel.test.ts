import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SourcesPanel from "../components/anvik/sources-panel";

function render(ui: React.ReactElement) {
  return renderToStaticMarkup(ui);
}

const sources = [
  { title: "Won the last World Cup", uri: "https://example.com/article", domain: "example.com" },
  { title: "UEFA record winners", uri: "https://www.other.org/b", domain: "other.org" },
];

test("renders genuine source titles, domains and working clickable links", () => {
  const markup = render(
    React.createElement(SourcesPanel, {
      sources,
      queries: ["latest news"],
      searchStatus: "on",
      defaultOpen: true,
    }),
  );
  // Titles are genuine — never invented.
  assert.match(markup, /Won the last World Cup/);
  assert.match(markup, /UEFA record winners/);
  // Domains come from the chunk's real domain field.
  assert.match(markup, /example\.com/);
  assert.match(markup, /other\.org/);
  // Citations are clickable links to the real URLs, opening in a new tab.
  assert.match(markup, /href="https:\/\/example\.com\/article"/);
  assert.match(markup, /href="https:\/\/www\.other\.org\/b"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noreferrer noopener"/);
  // The searched-for queries are shown honestly.
  assert.match(markup, /latest news/);
  // The honest count is shown.
  assert.match(markup, /2 sources/);
});

test("shows search-query chips", () => {
  const markup = render(
    React.createElement(SourcesPanel, {
      sources: [],
      queries: ["latest AI news", "ai news 2026"],
      searchStatus: "on",
      defaultOpen: true,
    }),
  );
  assert.match(markup, /latest AI news/);
  assert.match(markup, /ai news 2026/);
});

test("shows the honest no-sources message for a verified search with no attributable chunks", () => {
  const markup = render(
    React.createElement(SourcesPanel, {
      sources: [],
      queries: ["latest AI news"],
      searchStatus: "on",
      defaultOpen: true,
    }),
  );
  assert.match(markup, /Search ran, but no sources were returned/);
  assert.doesNotMatch(markup, /No sources to show/);
});

test("shows the honest unavailable state for a failed search — never verified claims", () => {
  const markup = render(
    React.createElement(SourcesPanel, {
      sources: [],
      queries: [],
      searchStatus: "unavailable",
      defaultOpen: true,
    }),
  );
  assert.match(markup, /Search unavailable/);
  assert.match(markup, /web could not be used/);
  assert.match(markup, /written directly by the model/);
});

test("renders nothing when the search is off", () => {
  const markup = render(
    React.createElement(SourcesPanel, {
      sources,
      queries: ["x"],
      searchStatus: "off",
      defaultOpen: true,
    }),
  );
  assert.equal(markup, "");
});

test("does not pretend sources exist when queries arrive but chunks never did", () => {
  const markup = render(
    React.createElement(SourcesPanel, {
      sources: [],
      queries: ["latest AI news"],
      searchStatus: "on",
      defaultOpen: true,
    }),
  );
  // The panel must not claim verified sources — the honest message is mandatory.
  assert.match(markup, /Search ran, but no sources were returned/);
  assert.doesNotMatch(markup, /Open source/);
});

test("sources panel handles a single source gracefully", () => {
  const markup = render(
    React.createElement(SourcesPanel, {
      sources: [{ title: "One", uri: "https://example.com/only", domain: "example.com" }],
      queries: [],
      searchStatus: "on",
      defaultOpen: true,
    }),
  );
  assert.match(markup, /1 source\b/);
  assert.match(markup, /One/);
});
