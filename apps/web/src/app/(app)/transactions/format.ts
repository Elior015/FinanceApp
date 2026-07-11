export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IL", { style: "currency", currency }).format(amount);
}
