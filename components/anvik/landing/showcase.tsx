import Link from "next/link";
import {
  ArrowUpRight,
  Code2,
  Eye,
  Image as ImageIcon,
  MessageSquarePlus,
  Mic2,
} from "lucide-react";

const MODES = [
  {
    href: "/chat",
    icon: MessageSquarePlus,
    number: "01",
    title: "Think it through.",
    name: "Chat",
    description: "Talk an idea out, untangle a question, or get a useful first draft.",
    visual: <div className="mode-visual-chat"><span className="mode-bubble mode-bubble-user">Where do I start?</span><span className="mode-bubble mode-bubble-ai"><i />Let&apos;s find the first small step.</span></div>,
    className: "mode-card-chat",
  },
  {
    href: "/code",
    icon: Code2,
    number: "02",
    title: "Build the thing.",
    name: "Code",
    description: "Go from a plain-language brief to a starting point you can work with.",
    visual: <div className="mode-visual-code"><span><b>01</b> function makeItReal() {'{'}</span><span><b>02</b> &nbsp;return <i>"hello, world"</i></span><span><b>03</b> {'}'}</span></div>,
    className: "mode-card-code",
  },
  {
    href: "/image",
    icon: ImageIcon,
    number: "03",
    title: "Picture the possibility.",
    name: "Image",
    description: "Give the abstract a shape. Turn a visual idea into something you can see.",
    visual: <div className="mode-visual-image"><span className="mode-sun" /><span className="mode-horizon" /><span className="mode-image-label">A new perspective</span></div>,
    className: "mode-card-image",
  },
  {
    href: "/voice",
    icon: Mic2,
    number: "04",
    title: "Say it out loud.",
    name: "Voice",
    description: "Keep the conversation moving in a more natural, hands-free way.",
    visual: <div className="mode-visual-voice" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>,
    className: "mode-card-voice",
  },
  {
    href: "/vision",
    icon: Eye,
    number: "05",
    title: "Look closer.",
    name: "Vision",
    description: "Bring in a photo, diagram or document and ask what you want to know.",
    visual: <div className="mode-visual-vision"><div className="vision-paper"><span /><span /><span /><i /></div><span className="vision-lens" /></div>,
    className: "mode-card-vision",
  },
] as const;

export function ModeShowcase() {
  return (
    <section className="public-showcase" id="tools" aria-labelledby="showcase-title">
      <div className="public-showcase-inner">
        <header className="public-showcase-intro">
          <div>
            <p className="public-section-eyebrow">FIVE WAYS INTO YOUR NEXT IDEA</p>
            <h2 className="public-showcase-heading" id="showcase-title">One workspace.<br /><span>Many ways forward.</span></h2>
          </div>
          <div className="public-showcase-aside">
            <p className="public-showcase-sub">Not another tool to keep up with. A thoughtful place to ask, experiment and make—whatever the idea needs next.</p>
            <a href="#languages" className="showcase-inline-link">And your language is welcome <ArrowUpRight aria-hidden="true" /></a>
          </div>
        </header>
        <div className="public-showcase-grid">
          {MODES.map(({ href, icon: Icon, number, title, name, description, visual, className }) => (
            <Link key={name} href={href} className={`public-mode-card ${className}`} prefetch={false}>
              <div className="mode-card-top">
                <span className="public-mode-number">{number} <i aria-hidden="true">/ 05</i></span>
                <span className="mode-card-icon"><Icon aria-hidden="true" /></span>
                <ArrowUpRight className="public-mode-arrow" aria-hidden="true" />
              </div>
              <div className="mode-card-visual" aria-hidden="true">{visual}</div>
              <div className="public-mode-copy">
                <span className="mode-card-name">{name}</span>
                <h3 className="public-mode-title">{title}</h3>
                <p className="public-mode-desc">{description}</p>
              </div>
            </Link>
          ))}
        </div>
        <div className="public-showcase-bottom">
          <span className="showcase-bottom-mark" aria-hidden="true">✳</span>
          <p>Different tools for different kinds of thinking.<br /><strong>One place to bring them together.</strong></p>
          <Link href="/chat" className="showcase-bottom-link">Explore your workspace <ArrowUpRight aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  );
}
