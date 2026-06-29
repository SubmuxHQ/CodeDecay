export function suggestClosestToken(input: string, candidates: string[]): string | undefined {
  const normalizedInput = normalizeSuggestionToken(input);
  if (!normalizedInput) {
    return undefined;
  }

  let bestCandidate: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeSuggestionToken(candidate);
    if (!normalizedCandidate) {
      continue;
    }

    if (normalizedCandidate === normalizedInput) {
      return candidate;
    }

    const distance = levenshteinDistance(normalizedInput, normalizedCandidate);
    const isPrefixMatch =
      normalizedCandidate.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedCandidate);

    if (distance < bestDistance || (distance === bestDistance && isPrefixMatch)) {
      bestCandidate = candidate;
      bestDistance = distance;
    }
  }

  if (!bestCandidate) {
    return undefined;
  }

  const normalizedCandidate = normalizeSuggestionToken(bestCandidate);
  const threshold = Math.max(1, Math.floor(Math.max(normalizedInput.length, normalizedCandidate.length) / 3));
  const isPrefixMatch = normalizedCandidate.startsWith(normalizedInput) || normalizedInput.startsWith(normalizedCandidate);

  return bestDistance <= threshold || isPrefixMatch ? bestCandidate : undefined;
}

function normalizeSuggestionToken(value: string): string {
  let normalized = value.trim().toLowerCase();
  normalized = normalized.split("=", 1)[0] ?? normalized;

  if (normalized.startsWith("--")) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith("-")) {
    normalized = normalized.slice(1);
  }

  let token = "";
  for (const char of normalized) {
    if (isLowerAsciiAlphaNumeric(char)) {
      token += char;
    }
  }
  return token;
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const deletion = (current[rightIndex - 1] ?? 0) + 1;
      const insertion = (previous[rightIndex] ?? 0) + 1;
      const substitution = (previous[rightIndex - 1] ?? 0) + substitutionCost;
      current[rightIndex] = Math.min(
        deletion,
        insertion,
        substitution
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index] ?? 0;
    }
  }

  return previous[right.length] ?? 0;
}

function isLowerAsciiAlphaNumeric(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}
