export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-().]/g, "");
}

function extractPhoneDigits(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !/^\+?[\d\s\-().]+$/.test(trimmed)) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function getPhoneCandidates(phone: string): string[] {
  const digits = extractPhoneDigits(phone);
  if (!digits) {
    return [];
  }

  const candidates = new Set<string>([digits]);
  const withoutTrunkPrefix = digits.replace(/^0+/, "");
  if (withoutTrunkPrefix) {
    candidates.add(withoutTrunkPrefix);
  }

  return [...candidates];
}

export function samePhone(left: string, right: string): boolean {
  if (normalizePhone(left) === normalizePhone(right)) {
    return true;
  }

  const leftCandidates = getPhoneCandidates(left);
  const rightCandidates = getPhoneCandidates(right);
  if (leftCandidates.length === 0 || rightCandidates.length === 0) {
    return false;
  }

  for (const leftCandidate of leftCandidates) {
    for (const rightCandidate of rightCandidates) {
      if (leftCandidate === rightCandidate) {
        return true;
      }

      const [longer, shorter] =
        leftCandidate.length >= rightCandidate.length
          ? [leftCandidate, rightCandidate]
          : [rightCandidate, leftCandidate];
      if (shorter.length >= 10 && longer.endsWith(shorter)) {
        return true;
      }
    }
  }

  return false;
}
