import Link from "next/link";
import {
  Code2,
  Image as ImageIcon,
  LayoutGrid,
  MessageSquarePlus,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/anvik/ui";

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
    <section className="public-showcase" aria-label="What ANVIK can do">
      <div className="public-showcase-inner">
        <h2 className="public-showcase-heading">Four modes. One calm workspace.</h2>
        <p className="public-showcase-sub">
          Switch modes in the sidebar once you&#39;re signed in. Each one shares the same
          conversation history and the same quiet attention to detail.
        </p>
        <div className="public-showcase-grid">
          {MODES.map((mode) => (
            <Link key={mode.title} href={mode.href} className="block" prefetch={true}>
              <Card key={mode.title} className="public-mode-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <mode.icon className="h-5 w-5" aria-hidden="true" />
                  <CardTitle className="text-base">{mode.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="public-mode-desc">{mode.description}</p>
              </CardContent>
            </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
