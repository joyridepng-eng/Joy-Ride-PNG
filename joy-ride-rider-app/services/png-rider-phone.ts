/** PNG mobile input. Authentication still receives an international number. */
export function formatPngRiderPhone(value: string): string {
  const compact = value.replace(/[\s()-]/g, "");
  let local = compact;
  if (compact.startsWith("+675")) local = compact.slice(4);
  else if (compact.startsWith("00675")) local = compact.slice(5);
  else if (/^675\d{8}$/.test(compact)) local = compact.slice(3);
  // Keep unsupported prefixes visible so validation cannot silently change them.
  if (!/^\d*$/.test(local)) return value;
  return local.length > 4 ? `${local.slice(0, 4)} ${local.slice(4)}` : local;
}

export function normalizePngRiderPhone(value: string): string | null {
  const local = formatPngRiderPhone(value).replace(/\s/g, "");
  return /^\d{8}$/.test(local) ? `+675${local}` : null;
}
