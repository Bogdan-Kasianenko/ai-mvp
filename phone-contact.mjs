export function inspectPhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { valid: false, normalized: null, kind: "empty", nationalLength: null, difference: null };
  if (!/^[+\d\s().-]+$/.test(raw)) return { valid: false, normalized: null, kind: "format", nationalLength: null, difference: null };
  let compact = raw.replace(/[\s().-]/g, "");
  if (compact.startsWith("00")) compact = "+" + compact.slice(2);
  let national = null;
  if (compact.startsWith("+420")) national = compact.slice(4);
  else if (/^420\d{8,}$/.test(compact)) national = compact.slice(3);
  else if (/^\d+$/.test(compact)) national = compact;
  if (national !== null && /^\d*$/.test(national)) {
    const valid = national.length === 9;
    return { valid, normalized: valid ? "+420" + national : null,
      kind: "cz", nationalLength: national.length, difference: national.length - 9 };
  }
  const valid = /^\+[1-9]\d{8,14}$/.test(compact);
  return { valid, normalized: valid ? compact : null,
    kind: "international", nationalLength: null, difference: null };
}

export function normalizePhone(value) {
  const checked = inspectPhone(value);
  return checked.valid ? checked.normalized : String(value ?? "").trim() || null;
}

export function phoneInputContext(message, expectingContact) {
  if (!expectingContact) return null;

  const text = String(message ?? "").trim();

  // Имя из 1–3 слов перед номером: Radek 448447445.
  const named = text.match(
    /^(?:[\p{L}\p{M}][\p{L}\p{M}'’.-]*[ \t]+){1,3}([+]?\d[\d \t().-]*)$/u
  );

  const raw = named ? named[1].trim() : text;

  if (!/^[+\d\s().-]+$/.test(raw)) return null;

  // Полная дата не должна становиться телефоном.
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    /^\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4}\.?$/.test(raw)
  ) {
    return null;
  }

  // Отдельный день или год не считаем номером.
  if (raw.replace(/\D/g, "").length <= 4) return null;

  return { ...inspectPhone(raw), raw };
}
