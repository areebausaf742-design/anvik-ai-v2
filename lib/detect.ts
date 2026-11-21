/**
 * Language detection — plan §6.1. Deterministic, sub-millisecond, no model call.
 * Order matters: script first, then Hinglish stopwords, else English.
 */

export type Lang = "hi" | "hi-Latn" | "en";

const DEVANAGARI = /[ऀ-ॿ]/g;
const LETTERS = /[a-zA-Zऀ-ॿ]/g;

/** ~90 romanised Hindi function words / inflections (plan §6.1). */
const HINGLISH = new Set([
  "kya","kaise","kaisa","kaisi","hai","hain","hoon","tha","thi","kaun","kab",
  "kahan","kyu","kyon","kyunki","mera","meri","mere","tera","teri","tere","aapka",
  "aapki","aap","hamara","humara","yeh","woh","karo","karna","chahiye","batao",
  "bataiye","samjhao","sahi","galat","paisa","paise","sarkar","sarkari","kitna",
  "kitni","bahut","abhi","phir","lekin","nahi","haan","sirf","liye","wala","wali",
  "hoga","hogi","sakta","sakti","raha","rahi","chuka","chuki","agar","bhi","mil",
  "mila","mili","lena","dena","karna","karun","karu","karen","karega","hogaya",
  "ho gaya","ho gayi","padta","padti","chalta","chalti","jata","jati","ana","jana",
  "khud","apna","apni","hum","tum","aaplog","bhai","didi","ji","sahab","beta","beti",
]);

export function detectLanguage(text: string): Lang {
  const letters = text.match(LETTERS);
  if (letters && letters.length > 0) {
    const deva = text.match(DEVANAGARI);
    const ratio = (deva ? deva.length : 0) / letters.length;
    if (ratio > 0.3) return "hi"; // >30%, not 50: Hinglish embeds Latin nouns (§6.1)
  }

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const hits = new Set(tokens.filter((t) => HINGLISH.has(t)));
  if (hits.size >= 2) return "hi-Latn"; // two distinct hits: single-token collisions are common

  return "en";
}

/** Display label for meta lines. */
export function langLabel(l: Lang): string {
  return l === "hi" ? "हिंदी" : l === "hi-Latn" ? "Hinglish" : "English";
}
