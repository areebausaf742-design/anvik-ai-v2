import Link from "next/link";

export default function NotFound() {
  return (
    <main className="narrow">
      <h1>This page isn&apos;t here</h1>
      <p className="ghost-note">The address may have changed, or the answer was taken down.</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 22 }}>
        <Link className="ask-btn" href="/chat">
          Ask a question
        </Link>
        <Link className="button button-quiet" href="/library">
          Browse prompt library
        </Link>
      </div>
    </main>
  );
}
