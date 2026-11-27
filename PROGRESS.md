# ANVIK AI V2 — Progress Log

## Status
- **Phases 1–7 — COMPLETE & MERGED & DEPLOYED** (main `ef17241`; Vercel READY)
- **Phase 8 — Training pipeline — IN PROGRESS** (branch `feat/training-phase-8` from main `ef17241`)
- **Baseline:** typecheck PASS, tests 383/383 PASS, build clean

## Phase 8 — Training pipeline (in progress)
Goal: PII-scrubbed opt-in dataset, LoRA fine-tuning scripts (Unsloth, Colab-friendly), GGUF export, model_versions registry, promotion gate (shadow → canary → rollback). Scope this pass: model_versions migration, pii-scrub utility, finetune script, registry helper.
- supabase/migrations/20261129000000_model_versions.sql — model_versions table + RLS
- lib/model-versions.ts — registry helper (canPromote, nextStatus, canRollback)
- scripts/pii-scrub.ts — PII scrubber (names, emails, phones, keys, cards, Aadhaar, tokens)
- scripts/finetune.py — LoRA fine-tuning (Unsloth) + GGUF export + candidate registration
- tests/ux-navigation-branding.test.ts — fixed for prompt-library refactor (Phase 6 follow-up)
- Work on fresh branch from origin/main; run typecheck/test/build; PR → merge; verify Vercel.
