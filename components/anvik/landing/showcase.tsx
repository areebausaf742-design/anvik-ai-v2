"use client";

import Link from "next/link";
import { ArrowUpRight, Code2, Eye, Image as ImageIcon, MessageCircle, Mic2 } from "lucide-react";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const MODES = [
  { name: "Chat", number: "01", icon: MessageCircle, title: "Think it through.", body: "Talk an idea out, untangle a question, or get a useful first draft.", href: "/chat" },
  { name: "Code", number: "02", icon: Code2, title: "Build the thing.", body: "Go from a plain-language brief to a starting point you can work with.", href: "/code" },
  { name: "Image", number: "03", icon: ImageIcon, title: "Picture the possibility.", body: "Give the abstract a shape. Turn a visual idea into something you can see.", href: "/image" },
  { name: "Voice", number: "04", icon: Mic2, title: "Say it out loud.", body: "Keep the conversation moving in a more natural, hands-free way.", href: "/voice" },
  { name: "Vision", number: "05", icon: Eye, title: "Look closer.", body: "Bring in a photo, diagram or document and ask what you want to know.", href: "/vision" },
] as const;

export function ModeShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const sceneRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const section = sectionRef.current;
    const orb = orbRef.current;
    if (!section || !orb) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const context = gsap.context(() => {
      const sceneCount = MODES.length;
      const setScene = (index: number) => {
        sceneRefs.current.forEach((scene, sceneIndex) => scene?.classList.toggle("is-active", sceneIndex === index));
        if (progressRef.current) progressRef.current.textContent = `${String(index + 1).padStart(2, "0")} / ${String(sceneCount).padStart(2, "0")}`;
      };
      setScene(0);
      gsap.to(orb, {
        rotate: 360,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
          pin: ".pinned-story-stage",
          pinSpacing: false,
          onUpdate: (self) => {
            const index = Math.min(sceneCount - 1, Math.floor(self.progress * sceneCount));
            setScene(index);
            orb.style.setProperty("--story-progress", `${self.progress}`);
          },
        },
      });
    }, section);
    return () => context.revert();
  }, []);

  return (
    <section className="public-showcase pinned-story" id="tools" ref={sectionRef} aria-labelledby="showcase-title">
      <div className="public-showcase-inner">
        <header className="public-showcase-intro">
          <div>
            <p className="public-section-eyebrow">FIVE WAYS INTO YOUR NEXT IDEA</p>
            <h2 className="public-showcase-heading" id="showcase-title">One workspace.<br /><span>Many ways forward.</span></h2>
          </div>
          <div className="public-showcase-aside">
            <p className="public-showcase-sub">The same calm intelligence, shaped for the moment you are in. Scroll through the surfaces without leaving the thought behind.</p>
            <span className="pinned-story-counter" ref={progressRef}>01 / 05</span>
          </div>
        </header>
        <div className="pinned-story-track">
          <div className="pinned-story-stage">
            <div className="story-orb-shell" aria-hidden="true">
              <div className="story-orb-grid" />
              <div className="story-orb-core" ref={orbRef} />
              <span className="story-orb-caption">ANVIK / ONE OBJECT / MANY OUTPUTS</span>
            </div>
            <div className="pinned-story-scenes">
              {MODES.map(({ name, number, icon: Icon, title, body, href }, index) => (
                <div className={`pinned-story-scene ${index === 0 ? "is-active" : ""}`} key={name} ref={(node) => { sceneRefs.current[index] = node; }}>
                  <div className="pinned-story-scene-meta"><span>{number}</span><Icon aria-hidden="true" /><span>{name}</span></div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <Link href={href} className="pinned-story-link">Open {name} <ArrowUpRight aria-hidden="true" /></Link>
                </div>
              ))}
            </div>
          </div>
          <div className="pinned-story-spacer" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
