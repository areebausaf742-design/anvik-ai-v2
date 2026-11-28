import Link from "next/link";
import { ArrowUpRight, Braces, Layers3, Sparkles, WandSparkles } from "lucide-react";

const LOGOS = ["NORTHSTAR", "KITE", "MOMENT", "FIELD NOTES", "INDEX", "COMMON ROOM", "FORM"];

export function BentoFeatures() {
  return (
    <section className="landing-bento-section" id="languages" aria-labelledby="bento-title">
      <div className="landing-bento-inner">
        <div className="landing-logo-marquee" aria-label="ANVIK works with every kind of team">
          <div className="landing-logo-track">{[...LOGOS, ...LOGOS].map((logo, index) => <span key={`${logo}-${index}`}>{logo}</span>)}</div>
        </div>
        <header className="landing-bento-heading">
          <p className="public-section-eyebrow">A QUIETER KIND OF POWER</p>
          <h2 id="bento-title">Make room for<br /><span>better next steps.</span></h2>
        </header>
        <div className="landing-bento-grid">
          <Link href="/chat" className="landing-bento-card landing-bento-card-wide">
            <div className="landing-bento-card-top"><span>01 / CONTEXT</span><ArrowUpRight aria-hidden="true" /></div>
            <div><Layers3 aria-hidden="true" /><h3>Everything stays in the thought.</h3><p>Move from question to draft to decision without resetting the room.</p></div>
            <div className="landing-bento-lines" aria-hidden="true"><i /><i /><i /><i /></div>
          </Link>
          <Link href="/code" className="landing-bento-card">
            <div className="landing-bento-card-top"><span>02 / CRAFT</span><ArrowUpRight aria-hidden="true" /></div>
            <div><Braces aria-hidden="true" /><h3>From words to working.</h3><p>Turn intent into a useful starting point.</p></div>
            <code aria-hidden="true">const next = await<br />anvik.make(idea)</code>
          </Link>
          <Link href="/image" className="landing-bento-card landing-bento-card-tall">
            <div className="landing-bento-card-top"><span>03 / EXPRESSION</span><ArrowUpRight aria-hidden="true" /></div>
            <div><WandSparkles aria-hidden="true" /><h3>Give the invisible a shape.</h3><p>Explore possibilities with a visual language that starts from your words.</p></div>
            <div className="landing-bento-image-orb" aria-hidden="true" />
          </Link>
          <Link href="/voice" className="landing-bento-card">
            <div className="landing-bento-card-top"><span>04 / RHYTHM</span><ArrowUpRight aria-hidden="true" /></div>
            <div><Sparkles aria-hidden="true" /><h3>Keep moving.</h3><p>Sometimes the fastest way forward is to say it out loud.</p></div>
            <div className="landing-bento-wave" aria-hidden="true">{Array.from({ length: 22 }).map((_, index) => <i key={index} />)}</div>
          </Link>
        </div>
      </div>
    </section>
  );
}
