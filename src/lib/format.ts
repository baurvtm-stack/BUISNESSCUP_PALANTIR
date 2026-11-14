/** Formats a dollar amount, e.g. usd(412) → "$412", usd(28.4, 2) → "$28.40". */
export function usd(n: number, digits = 0): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** "1 month", "6 months", "1.5 months", "2 years". */
export function duration(months: number): string {
  if (months >= 24 && Number.isInteger(months / 12)) return `${months / 12} years`;
  const m = Math.round(months * 10) / 10;
  return `${m} ${m === 1 ? "month" : "months"}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Whole months between two dates (fractional, can be negative). */
export function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getTime() + months * 30.44 * 24 * 60 * 60 * 1000);
}

export function shortDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function monthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(s: string): boolean {
  return s.length <= 254 && EMAIL_RE.test(s.trim());
}
