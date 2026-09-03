/** ISO-8601 UTC with a 'Z' suffix — the storage format for every timestamp. */
export const nowIso = (): string => new Date().toISOString();

export const isoPlusDays = (from: string | Date, days: number): string => {
  const d = from instanceof Date ? new Date(from) : new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

export const isoPlusMinutes = (from: string | Date, minutes: number): string => {
  const d = from instanceof Date ? new Date(from) : new Date(from);
  return new Date(d.getTime() + minutes * 60_000).toISOString();
};

/** True when `iso` is strictly in the future relative to `ref` (default: now). */
export const isFuture = (iso: string, ref: string = nowIso()): boolean =>
  new Date(iso).getTime() > new Date(ref).getTime();
