/**
 * Model versions registry (Phase 8 — training pipeline).
 *
 * A trained candidate serves traffic only after it beats the current baseline on
 * the evaluation harness: first in shadow mode, then as a small canary, with
 * one-click rollback. Promotion state is tracked in `public.model_versions`.
 *
 * This module is the client/server-side helper for reading the registry and
 * deciding whether a candidate may be promoted. It never mutates the registry
 * directly — writes go through the service role via Supabase.
 */

export type ModelStatus = "candidate" | "shadow" | "canary" | "promoted" | "rolled_back";

export type ModelVersion = {
  id: string;
  base_model: string;
  adapter_path?: string | null;
  gguf_path?: string | null;
  status: ModelStatus;
  eval_score?: number | null;
  baseline_score?: number | null;
  traffic_pct: number;
  created_at: string;
  promoted_at?: string | null;
  rolled_back_at?: string | null;
  notes?: string | null;
};

/** A candidate may be promoted only if it beats the baseline by a margin. */
export function canPromote(candidate: ModelVersion, baseline: ModelVersion | null): boolean {
  if (!candidate.eval_score) return false;
  if (!baseline || !baseline.eval_score) return true;
  return candidate.eval_score > baseline.eval_score;
}

/** Promotion gate: shadow → canary → promoted, with rollback at any step. */
export function nextStatus(current: ModelStatus, promoted: boolean): ModelStatus {
  if (!promoted) return "rolled_back";
  switch (current) {
    case "candidate":
      return "shadow";
    case "shadow":
      return "canary";
    case "canary":
      return "promoted";
    default:
      return current;
  }
}

/** One-click rollback: any non-baseline state can be rolled back. */
export function canRollback(v: ModelVersion): boolean {
  return v.status === "shadow" || v.status === "canary" || v.status === "promoted";
}
