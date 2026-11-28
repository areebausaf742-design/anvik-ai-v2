import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/code", label: "Code" },
  { href: "/image", label: "Image" },
  { href: "/vision", label: "Vision" },
  { href: "/projects", label: "Projects" },
  { href: "/settings", label: "Settings" },
  { href: "/chat", label: "Open workspace" },
] as const;

export function LandingFooter() {
  return (
    <footer className="public-footer" aria-label="Site footer">
      <div className="public-footer-inner">
        <div className="public-footer-brand">
          <span className="public-footer-mark" aria-hidden="true">◆</span>
          <span className="public-footer-name">ANVIK<span className="public-footer-ai">AI</span></span>
        </div>
        <nav className="public-footer-nav" aria-label="Footer navigation">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className="public-footer-link" prefetch={false}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="public-footer-note">
          ANVIK AI · A little more clarity, whenever you need it.
        </p>
      </div>
    </footer>
  );
}
