// Dependency-free fuzzy text similarity: blends word-level (Jaccard) and character-bigram
// (Sørensen-Dice) overlap so it tolerates both reordering (token overlap) and minor
// typos/pluralization (bigram overlap), e.g. "Hemodialysis" vs "Haemodialysis".

export function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, "") // strip file extension
    .replace(/^\s*\d+[.)]?\s*/, "") // strip leading numbering like "9 " or "12."
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text) {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

function bigramSet(text) {
  const normalized = normalize(text).replace(/\s+/g, "");
  const bigrams = new Set();
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.add(normalized.slice(i, i + 2));
  }
  return bigrams;
}

function overlapCoefficient(setA, setB, unionOp) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  return unionOp === "dice" ? (2 * intersection) / (setA.size + setB.size) : intersection / (setA.size + setB.size - intersection);
}

export function similarity(textA, textB) {
  const tokenScore = overlapCoefficient(tokenSet(textA), tokenSet(textB), "jaccard");
  const bigramScore = overlapCoefficient(bigramSet(textA), bigramSet(textB), "dice");
  return tokenScore * 0.5 + bigramScore * 0.5;
}
