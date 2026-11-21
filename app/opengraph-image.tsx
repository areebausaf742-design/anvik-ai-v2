import { ImageResponse } from "next/og";

/**
 * Share card. Text, not a mascot: the product's promise fits on one line, and
 * a forwarded link should read like a person sharing something useful
 * (plan §4.3). Paper background, ink type, one green rule.
 */
export const alt = "ANVIK — ask in your own words, get a straight answer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#08060c",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#7d6bff" }} />
          <div style={{ fontSize: 34, fontWeight: 700, color: "#f6f3fb", letterSpacing: "-0.02em" }}>anvik</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 76, fontWeight: 700, color: "#f6f3fb", lineHeight: 1.06, letterSpacing: "-0.035em" }}>
            Ask in your own words.
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, color: "#a993ff", lineHeight: 1.06, letterSpacing: "-0.035em" }}>
            Get a straight answer.
          </div>
          <div style={{ fontSize: 30, color: "#c6bfd6", maxWidth: 900, lineHeight: 1.4 }}>
            English, Hindi or Hinglish - with the steps, the fee, the office and the official page.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 3, background: "#7d6bff" }} />
          <div style={{ fontSize: 24, color: "#9d95b3" }}>Three free questions a day · no account needed</div>
        </div>
      </div>
    ),
    size,
  );
}
