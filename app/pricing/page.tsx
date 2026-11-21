import PricingRows from "./rows";

export const metadata = { title: "Pricing" };

/** §4.5: rows on paper, not a card grid. Prices inclusive of GST. */
export default function Pricing() {
  return (
    <main className="plans">
      <h1>Prices, in rupees</h1>
      <p className="ghost-note">
        The free tier is not a trial — three questions a day, forever. No card, ever. Prices include GST.
      </p>
      <div style={{ marginTop: 26 }}>
        <PricingRows />
      </div>
    </main>
  );
}
