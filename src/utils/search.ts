export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesNormalizedQuery(query: string, ...values: Array<string | null | undefined>): boolean {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => normalizeText(value ?? "").includes(normalizedQuery));
}

/**
 * Dev notes / manual checks (no unit-test runner configured yet):
 * - normalizeText("reclamación") === "reclamacion"
 * - matchesNormalizedQuery("calidad", "calidád documental") === true
 */
