"use client";

import { useAppearance } from "@/components/anvik/appearance-provider";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Separator,
} from "@/components/anvik/ui";

/**
 * /design — living style guide.
 *
 * Shows every ANVIK design token and component state, in the resolved theme
 * (System / Light / Dark). Open it to verify that a change to a token ripples
 * through every surface. Theme can be switched here and persists across the app.
 */

export default function DesignPage() {
  const { appearance, resolvedTheme, setAppearance } = useAppearance();

  const tokens = [
    { name: "--theme-bg", label: "Background", key: "bg" },
    { name: "--theme-surface", label: "Surface", key: "surface" },
    { name: "--theme-surface-muted", label: "Surface muted", key: "surface-muted" },
    { name: "--theme-surface-hover", label: "Surface hover", key: "surface-hover" },
    { name: "--theme-text", label: "Text", key: "text" },
    { name: "--theme-text-secondary", label: "Text secondary", key: "text-secondary" },
    { name: "--theme-text-muted", label: "Text muted", key: "text-muted" },
    { name: "--theme-border", label: "Border", key: "border" },
    { name: "--theme-border-strong", label: "Border strong", key: "border-strong" },
    { name: "--theme-focus", label: "Focus ring", key: "focus" },
  ] as const;

  return (
    <div className="min-h-[100dvh] bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <nav className="sticky top-0 z-20 border-b border-[var(--theme-border)] bg-[var(--theme-surface)]/95 backdrop-blur px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight">ANVIK</span>
            <span className="text-[var(--theme-text-muted)] text-xs">AI · Design system</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--theme-text-secondary)] uppercase tracking-wider">
              Theme
            </span>
            <div className="flex gap-1">
              {(["system", "light", "dark"] as const).map((mode) => (
                <Button
                  key={mode}
                  variant={appearance === mode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAppearance(mode)}
                >
                  {mode}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-72 shrink-0 border-r border-[var(--theme-border)] pr-8 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)] mb-6">
              Tokens
            </h2>
            <div className="space-y-2">
              {tokens.map((t) => (
                <div
                  key={t.name}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-[var(--theme-text-secondary)]"
                >
                  <span>{t.label}</span>
                  <span className="text-[var(--theme-text-muted)] text-[10px]">{t.name}</span>
                </div>
              ))}
            </div>
          </aside>

          <section className="flex-1 space-y-12">
            {/* Colors */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-6">Colors</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {tokens.map((t) => (
                  <Card key={t.name} className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg border border-[var(--theme-border)]" style={{ backgroundColor: `var(${t.name})` }} />
                      <div>
                        <p className="text-xs font-medium text-[var(--theme-text-secondary)] uppercase tracking-wider">
                          {t.label}
                        </p>
                        <p className="text-sm text-[var(--theme-text)]">{t.name}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <Separator />

            {/* Typography */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-6">Typography</h2>
              <div className="space-y-4">
                <div className="text-[var(--theme-text)]">
                  <p className="text-[var(--theme-text)] text-[14px] leading-relaxed">
                    Body text — 14px minimum on mobile, 15px on desktop, generous line height.
                  </p>
                  <p className="text-[var(--theme-text-secondary)] text-sm mt-2">
                    Small / muted text for captions and metadata.
                  </p>
                </div>
                <h1 className="text-4xl font-bold tracking-tight text-[var(--theme-text)] mb-2">H1 — Display heading</h1>
                <h2 className="text-2xl font-semibold tracking-tight text-[var(--theme-text)] mb-2">H2 — Section heading</h2>
                <h3 className="text-xl font-medium tracking-tight text-[var(--theme-text)] mb-2">H3 — Subheading</h3>
                <p className="text-lg text-[var(--theme-text-secondary)]">Lead paragraph — larger, for hero/eyebrow copy.</p>
              </div>
            </div>

            <Separator />

            {/* Components */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight mb-6">Components</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6">
                  <CardHeader>
                    <CardTitle>Buttons</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <Button variant="default">Default</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="default" disabled>Disabled</Button>
                  </CardContent>
                </Card>
                <Card className="p-6">
                  <CardHeader>
                    <CardTitle>Inputs & badges</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <Input id="design-input" name="design-input" placeholder="Type something…" />
                    <div className="flex items-center gap-3">
                      <Badge variant="default">Default</Badge>
                      <Badge variant="secondary">Secondary</Badge>
                      <Badge variant="destructive">Destructive</Badge>
                      <Badge variant="outline">Outline</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
