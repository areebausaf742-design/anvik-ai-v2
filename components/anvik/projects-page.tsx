"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FolderOpen,
  MessageSquarePlus,
  ExternalLink,
  Pencil,
  Trash2,
  Search,
  Check,
} from "lucide-react";
import TiltCard from "@/components/anvik/tilt-card";
import { useChatStore, type Conversation } from "@/store/use-chat-store";
import { useSession } from "@/components/anvik/session-provider";
import { activateChatOwner, resolveChatOwner } from "@/lib/chat-owner";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function groupOf(updatedAt: number): "Today" | "This week" | "Earlier" {
  const ageDays = (Date.now() - updatedAt) / 86_400_000;
  if (ageDays < 1) return "Today";
  if (ageDays < 7) return "This week";
  return "Earlier";
}

const GROUP_ORDER: Array<"Today" | "This week" | "Earlier"> = ["Today", "This week", "Earlier"];

function ProjectRow({
  project,
  onRename,
  onDelete,
}: {
  project: Conversation;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [renameValue, setRenameValue] = useState(project.title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const messageCount = project.messages.length;
  const assistantCount = project.messages.filter((m) => m.role === "assistant").length;

  const confirmRename = () => {
    const next = renameValue.trim().slice(0, 60);
    if (next && next !== project.title) onRename(project.id, next);
    setEditing(false);
  };

  return (
    <TiltCard className="rounded-2xl border border-[#EDEDED] bg-white shadow-sm">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") {
                  setEditing(false);
                  setRenameValue(project.title);
                }
              }}
              maxLength={60}
              aria-label="Rename project"
              className="w-full rounded-lg border border-[#1A1A1A] bg-white px-2.5 py-1.5 text-sm font-semibold text-[#1A1A1A] focus:outline-none"
            />
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-[#1A1A1A]">{project.title}</h3>
            </div>
          )}
          <p className="mt-1 text-xs text-[#666666]">
            {messageCount} messages · {assistantCount} answers · updated {timeAgo(project.updatedAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/chat?project=${encodeURIComponent(project.id)}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A1A1A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
          >
            Open in Chat <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Rename project"
            title="Rename"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E5E5] bg-white text-[#666666] hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={() => onDelete(project.id)}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-300 bg-rose-500/10 px-3 text-xs font-semibold text-rose-600"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="inline-flex h-9 items-center rounded-lg border border-[#E5E5E5] bg-white px-3 text-xs font-semibold text-[#666666] hover:bg-[#F7F7F5]"
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Delete ${project.title}`}
              title="Delete"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#EDEDED] bg-white text-[#999999] hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </TiltCard>
  );
}

export default function ProjectsPage() {
  const conversations = useChatStore((state) => state.conversations);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const { profile, session, loading: sessionLoading } = useSession();
  const [search, setSearch] = useState("");
  const [hydrated, setHydrated] = useState(false);
  // Identity has been applied to the store, so what we render belongs to the
  // current owner. Until then the list would be a lie.
  const [identityReady, setIdentityReady] = useState(false);
  const identityRef = useRef<string | null>(null);

  useEffect(() => setHydrated(true), []);

  /**
   * Point the store at this user's history before reading it.
   *
   * This page reads `useChatStore` directly, and that store is persisted under
   * a per-account localStorage key. Only /chat used to perform the switch, so a
   * direct visit or refresh of /projects read whichever key the store happened
   * to be on — normally the guest one — and showed empty or stale conversations
   * to a signed-in user. Both surfaces now go through lib/chat-owner.ts.
   */
  useEffect(() => {
    const owner = resolveChatOwner({
      sessionLoading,
      hasSession: Boolean(session),
      hasProfile: Boolean(profile),
      userId: profile?.id,
    });
    if (!owner) return;
    if (identityRef.current === owner) {
      setIdentityReady(true);
      return;
    }
    setIdentityReady(false);
    identityRef.current = owner;
    void activateChatOwner(owner)
      .catch(() => undefined)
      .finally(() => {
        if (identityRef.current === owner) setIdentityReady(true);
      });
  }, [sessionLoading, session, profile]);

  const ready = hydrated && identityReady;

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((conversation) => conversation.title.toLowerCase().includes(needle));
  }, [sorted, search]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, Conversation[]>();
    for (const conversation of filtered) {
      const key = groupOf(conversation.updatedAt);
      buckets.set(key, [...(buckets.get(key) ?? []), conversation]);
    }
    return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
      key,
      items: buckets.get(key) ?? [],
    }));
  }, [filtered]);

  const totalMessages = conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0);
  const todayCount = conversations.filter((conversation) => groupOf(conversation.updatedAt) === "Today").length;

  return (
    <main className="premium-library-page premium-projects-page mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="library-page-header mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#D97757]">
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" /> Projects
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1A1A1A] sm:text-4xl">
            Every project, one place.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#666666]">
            A project is a conversation thread — the workspace where a topic lives. Search, open, rename or remove yours.
          </p>
        </div>
        <Link
          href="/chat"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#333333]"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" /> New project
        </Link>
      </div>

      <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Projects", value: String(conversations.length) },
          { label: "Messages across projects", value: String(totalMessages) },
          { label: "Updated today", value: String(todayCount) },
        ].map((stat) => (
          <div key={stat.label} className="library-stat rounded-2xl border border-[#EDEDED] bg-[#F7F7F5] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#666666]">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold text-[#1A1A1A]">{stat.value}</p>
          </div>
        ))}
      </div>

      <label className="library-search mb-6 flex items-center gap-2 rounded-xl border border-[#EDEDED] bg-white px-4 py-3 focus-within:border-[#1A1A1A]">
        <Search className="h-4 w-4 shrink-0 text-[#999999]" aria-hidden="true" />
        <span className="sr-only">Search projects</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects"
          className="w-full bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#999999] focus:outline-none"
        />
      </label>

      {ready && sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E5E5E5] bg-white px-6 py-16 text-center">
          <FolderOpen className="h-10 w-10 text-[#D97757]" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-[#1A1A1A]">No projects yet</h2>
          <p className="mt-1 max-w-sm text-sm text-[#666666]">
            Projects grow automatically as you chat — every conversation becomes one, ready to reopen, rename or remove.
          </p>
          <Link
            href="/chat"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#333333]"
          >
            Create your first project <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : ready && filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E5E5E5] bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-[#1A1A1A]">Nothing matches “{search}”</p>
          <p className="mt-1 text-xs text-[#666666]">Try a different word, or clear the search.</p>
          <button
            type="button"
            onClick={() => setSearch("")}
            className="mt-4 rounded-lg border border-[#E5E5E5] bg-white px-4 py-2 text-xs font-semibold text-[#1A1A1A] hover:bg-[#F7F7F5]"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.key} aria-label={group.key}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#666666]">{group.key}</p>
              <div className="space-y-2.5">
                {group.items.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onRename={(id, title) => {
                      // Rename through the store — the chat sidebar stays in sync.
                      const store = useChatStore.getState();
                      const target = store.conversations.find((c) => c.id === id);
                      if (!target) return;
                      useChatStore.setState({
                        conversations: store.conversations.map((c) =>
                          c.id === id ? { ...c, title } : c,
                        ),
                      });
                    }}
                    onDelete={(id) => deleteConversation(id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
