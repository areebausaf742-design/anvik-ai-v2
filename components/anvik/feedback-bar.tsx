"use client";

import { useEffect, useState } from "react";
import { Check, GraduationCap, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  mirrorLearning,
  recordCorrection,
  recordFeedback,
  type Verdict,
} from "@/lib/learning";

export default function FeedbackBar({
  question,
  answer,
  credit,
  model,
  verdict,
  taught,
  onVerdict,
  onTaught,
  onError,
}: {
  question: string;
  answer: string;
  checked?: boolean;
  fixed?: boolean;
  credit?: string;
  model?: string;
  verdict?: Verdict;
  taught?: boolean;
  onVerdict: (verdict: Verdict | undefined) => void;
  onTaught: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(""), 4000);
    return () => window.clearTimeout(timer);
  }, [note]);

  function vote(next: Verdict) {
    const active = verdict === next ? undefined : next;
    const { redacted } = recordFeedback({ question, answer, verdict: next });
    mirrorLearning({ verdict: next, question, answer });
    onVerdict(active);
    setOpen(active === "dislike");
    if (active === "dislike") {
      setNote("Thanks — tell ANVIK what the right answer was.");
    } else if (active === "like") {
      setNote("Feedback saved locally.");
    } else {
      setNote("");
    }
    if (redacted.length > 0) {
      onError(
        `Not stored: ANVIK removed ${redacted.join(", ")} from what you sent.`,
      );
    }
  }

  function teach() {
    const text = draft.trim();
    if (!text) return;
    const { redacted } = recordCorrection({ question, answer, correction: text });
    mirrorLearning({ verdict: "correction", question, answer, correction: text });
    onTaught();
    setDraft("");
    setOpen(false);
    if (redacted.length > 0) {
      setNote(`Saved, with ${redacted.join(", ")} removed first.`);
    } else {
      setNote("Correction saved to your local learning preferences.");
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-2 py-0.5 text-[11px] font-medium text-[#67e8f9]">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {credit || "From Gemini"}
            {model ? <span className="text-slate-400">· {model}</span> : null}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              verdict === "like"
                ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
            aria-pressed={verdict === "like"}
            aria-label="This answer helped"
            onClick={() => vote("like")}
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Helpful</span>
          </button>

          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              verdict === "dislike"
                ? "border-rose-400/50 bg-rose-500/20 text-rose-200"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
            aria-pressed={verdict === "dislike"}
            aria-label="This answer was wrong or unhelpful"
            onClick={() => vote("dislike")}
          >
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Not right</span>
          </button>

          {!open && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
              onClick={() => setOpen(true)}
              aria-expanded={open}
            >
              <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{taught ? "Teach again" : "Teach ANVIK"}</span>
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-white/10 bg-[#050508]/70 p-3">
          <label htmlFor="teach-input" className="block text-xs font-medium text-slate-200">
            What should ANVIK have answered?
            <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
              Saved on this device only. Keys, passwords, and phone numbers are redacted.
            </span>
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <textarea
              id="teach-input"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write the correction in your own words..."
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-[#22D3EE]"
            />
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn-gradient inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                onClick={teach}
                disabled={!draft.trim()}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Save
              </button>
              <button
                type="button"
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {note && (
        <p className="mt-2 text-xs text-[#67e8f9]" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
