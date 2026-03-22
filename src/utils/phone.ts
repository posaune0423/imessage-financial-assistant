export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-().]/g, "");
}

export function samePhone(left: string, right: string): boolean {
  return normalizePhone(left) === normalizePhone(right);
}
