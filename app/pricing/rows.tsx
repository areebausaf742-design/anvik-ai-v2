"use client";

import { useState } from "react";
import Link from "next/link";

const NOTE =
  "Paid packs are not live yet. Nothing will be charged — the free tier is the whole product today.";

export default function PricingRows() {
  const [note, setNote] = useState("");

  const pick = () => setNote(NOTE);

  return (
    <>
      <div className="plan-row">
        <h2>Free</h2>
        <span className="price">₹0</span>
        <p>3 questions a day · history on this device · public answer pages</p>
        <Link className="ask-btn" href="/chat">
          Start here
        </Link>
      </div>
      <div className="plan-row">
        <h2>Pack</h2>
        <span className="price">₹19</span>
        <p>25 questions once, valid 30 days · no subscription</p>
        <button onClick={pick} type="button">Choose</button>
      </div>
      <div className="plan-row">
        <h2>Daily</h2>
        <span className="price">₹49/mo</span>
        <p>50 questions a day · history on every device · longer answers · GST invoice</p>
        <button onClick={pick} type="button">Choose</button>
      </div>
      <div className="plan-row">
        <h2>Yearly</h2>
        <span className="price">₹399/yr</span>
        <p>Works out to ₹33/mo · everything in Daily, all year · saves 32%</p>
        <button onClick={pick} type="button">Choose</button>
      </div>
      {note && (
        <p className="err-line" role="status">
          {note}
        </p>
      )}
    </>
  );
}
