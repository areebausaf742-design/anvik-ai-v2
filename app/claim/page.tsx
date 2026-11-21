"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * §4.4 claim state. One centred column on paper: reason line, one number
 * field, one commit, one "Later" link. Honest until accounts exist.
 */
export default function Claim() {
  const [number, setNumber] = useState("");
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState("");

  const digits = number.replace(/\D/g, "");
  const ready = digits.length === 10;
  const showHint = touched && digits.length > 0 && !ready;

  return (
    <main className="narrow" data-screen="claim">
      <h1>Your history, on every device</h1>
      <p className="ghost-note">
        Add a mobile number and this device&apos;s history can follow you to your next phone.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (!ready) return;
          setNote("Numbers are not being collected yet — your history stays safe on this device, and nothing is lost.");
        }}
      >
        <label className="sr-only" htmlFor="claim-mobile">
          Mobile number
        </label>
        <input
          id="claim-mobile"
          className="field"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="10-digit mobile number"
          value={number}
          onBlur={() => setTouched(true)}
          onChange={(event) => {
            setNumber(event.target.value.replace(/\D/g, "").slice(0, 10));
            setNote("");
          }}
          aria-describedby={showHint ? "claim-hint" : undefined}
          aria-invalid={showHint || undefined}
        />
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <button className="ask-btn" type="submit" disabled={!ready}>
            Send code
          </button>
        </div>
        {showHint && (
          <p className="err-line" id="claim-hint">
            Enter all 10 digits — {10 - digits.length} to go.
          </p>
        )}
      </form>

      {note && <p className="err-line">{note}</p>}

      <p style={{ marginTop: 20 }}>
        <Link href="/h" className="text-link" style={{ justifyContent: "center" }}>
          Later — just show this device&apos;s history
        </Link>
      </p>
    </main>
  );
}
