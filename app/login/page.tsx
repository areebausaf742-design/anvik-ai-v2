import Link from "next/link";
import type { Metadata } from "next";
import Orb from "@/components/anvik/orb";
import { Brand } from "@/components/anvik/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";

export const metadata: Metadata = { title: "Welcome", description: "Start with a question." };

/** No photograph, no fabricated pull-quote, no social buttons (plan §3.6). */
export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-art">
        <Brand />
        <div className="login-art-center">
          <Orb />
          <p className="eyebrow">
            <span className="eyebrow-light" /> English · हिंदी · Hinglish
          </p>
          <blockquote>
            Anvikshiki is the lamp of all the sciences,
            <br />
            the means of all actions.
          </blockquote>
          <span className="login-art-credit">Kautilya, Arthashastra</span>
        </div>
        <span className="login-art-coordinate">Ask in your words, get it answered.</span>
      </div>

      <section className="login-form-wrap">
        <div className="login-form">
          <div className="login-mobile-brand">
            <Brand />
          </div>
          <p className="eyebrow">No account needed</p>
          <h1>
            Start with
            <br />
            <span className="gradient-text">one question.</span>
          </h1>
          <p>
            ANVIK answers in the language you asked in, with the steps and the official page. History
            stays on this device.
          </p>
          <Link href="/chat" className="button button-bright login-continue">
            Ask your first question <ArrowRight />
          </Link>
          <div className="login-divider">
            <span /> Three free questions a day <span />
          </div>
          <div className="login-privacy">
            <LockKeyhole />
            <p>
              <b>Your key and your history stay in this browser.</b>
              Add a free Gemini key in Settings to turn on live answers; nothing is uploaded to an
              account.
            </p>
          </div>
          <Link className="login-back" href="/">
            Back to the beginning
          </Link>
        </div>
      </section>
    </main>
  );
}
