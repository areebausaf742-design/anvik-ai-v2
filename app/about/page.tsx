export const metadata = { title: "About" };

/** §4.7, English-only chrome (owner spec 21 Nov): the Sanskrit line survives
 *  as IAST transliteration — no Devanagari glyphs anywhere in the UI. */
export default function About() {
  return (
    <main className="about">
      <h1>Anvik — named for the lamp of all sciences</h1>
      <blockquote>
        pradīpaḥ sarvavidyānām upāyaḥ sarvakarmaṇām |
        <br />
        āśrayaḥ sarvadharmāṇāṃ śāśvataṃ anvīkṣikī matā ||
      </blockquote>
      <p>
        &ldquo;Anvikshiki is the lamp of all the sciences, the means of all actions, and the support of
        all dharma.&rdquo; — Kautilya, <em>Arthashastra</em>: the classical discipline of inquiry, examining
        what follows from what. The product is named for it, and the wordmark is the word, lowercase,
        with no icon.
      </p>

      <h2>What it does</h2>
      <p>
        One field. Ask anything in plain words and get a clear, ordered answer in the language you
        wrote — English, Hindi or Hinglish. Every answer that passes human review gets its own public
        page you can forward to anyone. No account and no card to start: three questions a day, free,
        forever.
      </p>

      <h2>What it will not answer</h2>
      <p>
        Some questions are not ours to answer: diagnosing illness or dosing medicine (we route to a
        doctor, to 108 in an emergency, and to Tele-MANAS 14416 for mental health), predicting the
        outcome of a legal case, recommending a specific stock, fund or investment, and any path that
        harms someone. Where an answer is limited, we say where the limit is and name the official
        source.
      </p>

      <h2>Cost, not hidden</h2>
      <p>
        Every answer&apos;s cost is written to our own ledger in rupee paise at write time, and the
        product&apos;s limits are set by it — including a global daily spend ceiling past which the site
        stops taking new questions while every public answer stays readable. The full arithmetic lives
        in the open in <code>docs/ANVIK-PLAN.md</code>.
      </p>

      <h2>A human, if you need one</h2>
      <p>
        One address: <a href="mailto:namaste@anvik.ai">namaste@anvik.ai</a>. We read it, and we try to
        answer within two working days. No form.
      </p>
    </main>
  );
}
