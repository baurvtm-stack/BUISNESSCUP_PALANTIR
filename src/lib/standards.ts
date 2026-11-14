/** Public kit standards, derived from the products currently selected. */
export function coveredStandards(products: readonly { standards: readonly string[] }[]): string[] {
  return [...new Set(products.flatMap((product) => product.standards))]
    .filter((standard) => /ASTM|ANSI|NFPA|NRR/.test(standard));
}
