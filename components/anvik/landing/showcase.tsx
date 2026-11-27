import Link from "next/link";
import {
  ArrowUpRight,
  Code2,
  Image as ImageIcon,
  MessageSquarePlus,
  Eye,
} from "lucide-react";

const MODES = [
  {
    href: "/chat",
    icon: MessageSquarePlus,
    title: "Chat",
    description: "Ask anything. Get instant, intelligent answers in English, Hindi or Hinglish.",
  },
  {
    href: "/code",
    icon: Code2,
    title: "Code",
    description: "Describe it. Generate clean, efficient code — Python, JavaScript, Java and more.",
  },
  {
    href: "/image",
    icon: ImageIcon,
    title: "Image",
    description: "Describe a scene. See it rendered, with style presets, aspect ratios and upscale.",
  },
  {
    href: "/vision",
    icon: Eye,
    title: "Vision",
    description: "Upload an image. Ask ANVIK about any photo, diagram, document or screenshot.",
  },
] as const;

export function ModeShowcase() {
  return (
    <section className="public-showcase" aria-label="Explore ANVIK modes">
      <div className="public-showcase-inner">
        <header className="public-showcase-intro">
          <div>
            <p className="public-section-eyebrow">FOUR WAYS TO MAKE PROGRESS</p>
            <h2 className="public-showcase-heading">More than a chat window.</h2>
          </div>
          <p className="public-showcase-sub">
            Move from a first question to finished work without losing your train of thought.
            Every mode shares the same considered workspace.
          </p>
        </header>
        <div className="public-showcase-grid">
          {MODES.map((mode, index) => (
            <Link key={mode.title} href={mode.href} className="public-mode-card" prefetch={true}>
              <span className="public-mode-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="public-mode-icon" aria-hidden="true">
                <mode.icon />
              </span>
              <span className="public-mode-copy">
                <h3 className="public-mode-title">{mode.title}</h3>
                <p className="public-mode-desc">{mode.description}</p>
              </span>
              <ArrowUpRight className="public-mode-arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
