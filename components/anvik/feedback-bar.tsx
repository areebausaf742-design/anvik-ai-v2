"use client";

import { useEffect, useState } from "react";
import { Check, GraduationCap, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  mirrorLearning,
  recordCorrection,
  recordFeedback,
  type Verdict,
} from "@/lib/learning";

const REASON_CHIPS = ["Inaccurate", "Off-topic", "Too verbose", "Missing sources", "Wrong code"] as const;

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
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(""), 4000);
    return () => window.clearTimeout(timer);
  }, [note]);

  function vote(next: Verdict) {
    const active = verdict === next ? undefined : next;
    if (next === "dislike") {
      setSelectedReasons([]);
      const { redacted } = recordFeedback({ question, answer, verdict: "dislike" });
      mirrorLearning({ verdict: "dislike", question, answer });
      if (redacted.length > 0) {
        onError(`Not stored: ANVIK removed ${redacted.join(", ")} from what you sent.`);
      }
    } else {
      const { redacted } = recordFeedback({ question, answer, verdict: "like" });
      mirrorLearning({ verdict: "like", question, answer });
      if (redacted.length > 0) {
        onError(`Not stored: ANVIK removed ${redacted.join(", ")} from what you sent.`);
      }
    }
    onVerdict(active);
    setOpen(active === "dislike");
    if (active === "dislike") {
      setNote("Thanks — pick a reason or tell ANVIK what the right answer was.");
    } else if (active === "like") {
      setNote("Feedback saved locally.");
    } else {
      setNote("");
    }
  }

  function toggleReason(reason: string) {
    const next = selectedReasons.includes(reason)
      ? selectedReasons.filter((r) => r !== reason)
      : [...selectedReasons, reason];
    setSelectedReasons(next);
    recordFeedback({ question, answer, verdict: "dislike", reasons: next });
    mirrorLearning({ verdict: "dislike", question, answer });
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
    <div className="mt-3 border-t border-[#EDEDED] pt-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-[#EDEDED] bg-[#F7F7F5] px-2 py-0.5 text-[11px] font-medium text-[#1A1A1A]">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {credit || "ANVIK"}
            {model ? <span className="text-[#666666]">· {model}</span> : null}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              verdict === "like"
                ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
                : "border-[#EDEDED] bg-white text-[#666666] hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
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
                : "border-[#EDEDED] bg-white text-[#666666] hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
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
              className="inline-flex items-center gap-1 rounded-lg border border-[#EDEDED] bg-white px-2.5 py-1 text-xs font-medium text-[#666666] transition hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
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
        <div className="mt-3 rounded-xl border border-[#EDEDED] bg-white p-3">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[11px] font-medium text-[#666666]">Reason (optional):</span>
            {REASON_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => toggleReason(chip)}
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  selectedReasons.includes(chip)
                    ? "border-[#D97757] bg-[#D97757]/10 text-[#D97757]"
                    : "border-[#EDEDED] bg-[#F7F7F5] text-[#666666] hover:bg-[#F0F0EE]"
                }`}
                aria-pressed={selectedReasons.includes(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <label htmlFor="teach-input" className="block text-xs font-medium text-[#1A1A1A]">
            What should ANVIK have answered?
            <span className="mt-0.5 block text-[11px] font-normal text-[#666666]">
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
              className="w-full rounded-lg border border-[#EDEDED] bg-white px-3 py-2 text-xs text-[#1A1A1A] placeholder:text-[#999999] focus:border-[#D97757]"
            />
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#333333]"
                onClick={teach}
                disabled={!draft.trim()}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Save
              </button>
              <button
                type="button"
                className="rounded-lg border border-[#EDEDED] bg-white px-3 py-1.5 text-xs text-[#666666] hover:bg-[#F7F7F5]"
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
