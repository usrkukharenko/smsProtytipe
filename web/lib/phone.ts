export type NormalizedPhone = string;

export function normalizePhone(raw: string): NormalizedPhone | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let core = digits;
  if (core.length === 11 && core.startsWith("8")) core = "7" + core.slice(1);
  if (core.length === 10) core = "7" + core;

  if (core.length !== 11 || !core.startsWith("7")) return null;

  const operatorFirstDigit = core[1];
  if (operatorFirstDigit !== "9") return null;

  return "+" + core;
}

export function formatPhoneDisplay(normalized: NormalizedPhone): string {
  const d = normalized.replace(/\D/g, "");
  if (d.length !== 11) return normalized;
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}
