"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Item = { q: string; slug: string; at: number };

const MAX_ITEMS = 50;

function rel(at: number): string {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} days ago`;
}

function parse(value: string): Item[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (item): item is Item =>
        !!item &&
        typeof item === "object" &&
        typeof (item as Item).q === "string" &&
        typeof (item as Item).slug === "string" &&
        typeof (item as Item).at === "number",
    )
    .slice(0, MAX_ITEMS);
}

export default function History() {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("anvik_h");
      if (raw) setItems(parse(raw));
    } catch {
      setItems([]);
    }
    setLoaded(true);
  }, []);

  const save = (next: Item[]) => {
    setItems(next);
    try {
      localStorage.setItem("anvik_h", JSON.stringify(next.slice(0, MAX_ITEMS)));
    } catch {
      /* ignore */
    }
  };

  return (
    <main className="wide-list">
      <h1>Your history</h1>
      <p className="ghost-note">
        Saved items on this device only — no account, no server copy.
      </p>

      {loaded && items.length === 0 ? (
        <p className="ghost-note" style={{ marginTop: 22 }}>
          Nothing here yet. <Link href="/chat">Open Chat</Link> to start a conversation with ANVIK.
        </p>
      ) : (
        <>
          <div style={{ marginTop: 18 }}>
            {items.map((it, i) => (
              <Link className="hist-item" key={`${it.slug}-${i}`} href={`/j/${encodeURIComponent(it.slug)}`}>
                {it.q}
                <span>{rel(it.at)}</span>
              </Link>
            ))}
          </div>
          <div className="hist-tools">
            <Link href="/claim">Save history across devices</Link>
            {!confirmClear ? (
              <button type="button" onClick={() => setConfirmClear(true)}>
                Delete all
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    save([]);
                    setConfirmClear(false);
                  }}
                >
                  Confirm delete
                </button>
                <button type="button" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
