/**
 * Devanagari → ASCII slug transliteration (plan §4.3: readable-ASCII slugs,
 * Devanagari on-page; punycode URLs break in WhatsApp previews).
 */

const CONSONANTS: Record<string, string> = {
  "क":"k","ख":"kh","ग":"g","घ":"gh","ङ":"n","च":"ch","छ":"chh","ज":"j","झ":"jh",
  "ञ":"n","ट":"t","ठ":"th","ड":"d","ढ":"dh","ण":"n","त":"t","थ":"th","द":"d",
  "ध":"dh","न":"n","प":"p","फ":"ph","ब":"b","भ":"bh","म":"m","य":"y","र":"r",
  "ल":"l","व":"v","श":"sh","ष":"sh","स":"s","ह":"h","ळ":"l","क्ष":"ksh","ज्ञ":"gy",
};

const VOWELS: Record<string, string> = {
  "अ":"a","आ":"aa","इ":"i","ई":"ee","उ":"u","ऊ":"oo","ऋ":"ri","ए":"e","ऐ":"ai",
  "ओ":"o","औ":"au",
};

const MATRAS: Record<string, string> = {
  "ा":"a","ि":"i","ी":"ee","ु":"u","ू":"oo","ृ":"ri","े":"e","ै":"ai","ो":"o","ौ":"au",
};

const DIGITS: Record<string, string> = {
  "०":"0","१":"1","२":"2","३":"3","४":"4","५":"5","६":"6","७":"7","८":"8","९":"9",
};

export function transliterate(input: string): string {
  let out = "";
  const chars = Array.from(input);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (CONSONANTS[c]) {
      out += CONSONANTS[c];
      const next = chars[i + 1];
      // matra or halant replaces the inherent vowel
      if (next && (MATRAS[next] || next === "्")) continue;
      // word-final schwa deletion: a consonant ending a word keeps no 'a'
      // ("kisan", not "kisana"); medially the inherent vowel stays
      const nextIsDevanagari = next !== undefined && /[ऀ-ॿ]/.test(next);
      if (nextIsDevanagari) out += "a";
    } else if (c === "़") {
      /* nukta: folding marker, contributes no sound of its own */
      continue;
    } else if (VOWELS[c]) out += VOWELS[c];
    else if (MATRAS[c]) out += MATRAS[c];
    else if (DIGITS[c]) out += DIGITS[c];
    else if (c === "्") out += "";
    else if (c === "ं") out += "n";
    else if (c === "ः") out += "h";
    else if (c === "ँ") out += "n";
    else out += c;
  }
  return out;
}

export function slugify(input: string): string {
  const ascii = transliterate(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return ascii || "sawal";
}
