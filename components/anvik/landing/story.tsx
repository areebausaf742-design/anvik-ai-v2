import Link from "next/link";
import { ArrowRight, ArrowUpRight, Braces, MessageCircle, Sparkles } from "lucide-react";

const STEPS = [
  { number: "01", icon: MessageCircle, title: "Begin anywhere.", body: "A half-formed idea, a question you have not quite phrased, the thing you have to get done. Start where you are." },
  { number: "02", icon: Sparkles, title: "Find the thread.", body: "Think out loud, ask for a second pass or take the conversation somewhere new. Your language is welcome here." },
  { number: "03", icon: Braces, title: "Make it real.", body: "Turn the idea into code, a visual, a voice note or a clearer answer—without leaving the workspace." },
];

const METRICS = [
  ["05", "ways to move an idea forward"],
  ["10", "free questions to start each day"],
  ["∞", "room for the next thought"],
] as const;

export function StorySection() {
  return (
    <section className="landing-story" id="how-it-works" aria-labelledby="story-title">
      <div className="landing-story-inner">
        <div className="landing-story-heading">
          <p className="public-section-eyebrow"><span className="public-live-dot" /> A MORE HUMAN WAY TO WORK WITH AI</p>
          <h2 id="story-title">Good work doesn&apos;t begin with a perfect prompt.</h2>
          <p>It begins with a person. ANVIK meets you there—and helps you find what comes next.</p>
        </div>
        <div className="landing-story-list">
          {STEPS.map(({ number, icon: Icon, title, body }) => (
            <article className="landing-story-step" key={number}>
              <div className="landing-story-step-top"><span className="landing-story-index">{number}</span><span className="landing-story-icon"><Icon aria-hidden="true" /></span></div>
              <div className="landing-story-step-copy"><h3>{title}</h3><p>{body}</p></div>
              <div className="landing-story-detail"><span className="story-output"><span>THOUGHT</span><span className="story-output-line" /><span>TAKES SHAPE</span><ArrowUpRight aria-hidden="true" /></span></div>
            </article>
          ))}
        </div>
        <Link className="landing-story-link" href="/chat">Start wherever you are <ArrowRight aria-hidden="true" /></Link>
        <div className="landing-metrics" aria-label="ANVIK metrics">
          {METRICS.map(([value, label]) => <div className="landing-metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}
        </div>
        <div className="landing-final-cta">
          <div className="landing-final-cta-shader" aria-hidden="true" />
          <div className="landing-final-cta-copy">
            <p className="public-section-eyebrow">NO PERFECT PROMPT. NO BIG REVEAL.</p>
            <h2>Your next step can start small.</h2>
            <p>Bring a question, a rough thought or something you want to make. We will take it from there.</p>
          </div>
          <Link className="landing-final-cta-link" href="/chat">Start a conversation <ArrowRight aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  );
}
