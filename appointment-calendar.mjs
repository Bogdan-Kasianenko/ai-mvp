const months = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];

export function readAppointmentDate(value) {
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let year, month, day;
  if (match) [, year, month, day] = match;
  else {
    match = text.match(/^(\d{1,2})\s*[.,/]\s*(\d{1,2})\s*[.,/]\s*(\d{4})\.?$/);
    if (match) [, day, month, year] = match;
    else {
      match = text.toLocaleLowerCase("cs").match(/^(\d{1,2})\.?\s+([^\s]+)\s+(\d{4})\.?$/);
      if (!match) return null;
      day = match[1];
      month = months.indexOf(match[2]) + 1;
      year = match[3];
    }
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return null;
  return date.toISOString().slice(0, 10);
}

export function appointmentDay(iso, company) {
  if (!iso || readAppointmentDate(iso) !== iso) return null;
  const date = new Date(iso + "T12:00:00Z");
  const weekday = date.getUTCDay();
  const hours = company.openingHours?.[weekday === 0 ? "sunday" : weekday === 6 ? "saturday" : "mondayToFriday"] ?? null;
  return {
    date: iso,
    weekday: ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"][weekday],
    hours,
    closed: typeof hours === "string" && hours.trim().toLocaleLowerCase("cs") === "zavřeno",
  };
}

export function appointmentCalendar(company, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (name) => parts.find((part) => part.type === name).value;
  const start = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00Z`);
  return Array.from({ length: 366 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    const info = appointmentDay(date.toISOString().slice(0, 10), company);
    return `${info.date}: ${info.weekday}, ${info.hours ?? "otevírací doba neznámá"}`;
  }).join("\n");
}

export function appointmentContext(message, intake, review, company, now = new Date()) {
  let date = readAppointmentDate(message);
  let partial = false;
  const short = String(message).trim().match(/^(\d{1,2})(?:\s*[.,/]\s*(\d{1,2}))?\.?$/);
  if (!date && short) {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (name) => parts.find((part) => part.type === name).value;
    const base = readAppointmentDate(intake.preferredTime) ?? review?.date ?? `${get("year")}-${get("month")}-${get("day")}`;
    date = readAppointmentDate(`${short[1]}.${short[2] ?? base.slice(5, 7)}.${base.slice(0, 4)}`);
    partial = true;
  }
  return {
    requested: appointmentDay(date, company),
    requiresFullDateConfirmation: Boolean(date && partial),
    currentPreference: appointmentDay(readAppointmentDate(intake.preferredTime), company),
    pendingClosedDate: appointmentDay(review?.date, company),
  };
}

export function reviewAppointment({ previous, next, message, company, review, keepClosedDay = false }) {
  const explicitDate = readAppointmentDate(message);
  const date = explicitDate ?? readAppointmentDate(next.preferredTime) ?? (keepClosedDay ? review?.date : null);
  const info = appointmentDay(date, company);
  if (!info) return { blocked: false, review: review ?? null };
  if (!info.closed) {
    next.preferredTime = date;
    return { blocked: false, review: null };
  }
  const alreadyReviewed = review?.date === date;
  if (alreadyReviewed && (review.accepted === true || keepClosedDay === true)) {
    next.preferredTime = date;
    return { blocked: false, review: { date, accepted: true }, exception: true };
  }
  // Keep the proposed date in server-owned review state, not in the accepted draft.
  next.preferredTime = readAppointmentDate(previous.preferredTime) === date ? null : previous.preferredTime;
  return { blocked: true, review: { date, accepted: false }, info };
}

export function closedDayMessage(info, language = "cs") {
  const locales = { cs: "cs-CZ", sk: "sk-SK", en: "en-GB", ru: "ru-RU", uk: "uk-UA", de: "de-DE" };
  const date = new Intl.DateTimeFormat(locales[language] ?? "en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(info.date + "T12:00:00Z"));
  const replies = {
    cs: `Termín ${date} vychází na den, kdy máme zavřeno. Vyhovoval by Vám jiný den?`,
    sk: `Termín ${date} pripadá na deň, keď máme zatvorené. Vyhovoval by Vám iný deň?`,
    en: `${date} is a day when the garage is closed. Would another day work for you?`,
    ru: `${date} сервис закрыт. Вам подойдёт другой день?`,
    uk: `${date} сервіс зачинений. Вам підійде інший день?`,
    de: `Am ${date} ist die Werkstatt geschlossen. Würde Ihnen ein anderer Tag passen?`,
  };
  return replies[language] ?? replies.en;
}

export function closedDayNote(language = "cs") {
  return ({ cs: "Tento termín je mimo otevírací dobu; možnost převzetí vozu musí ověřit servis.", sk: "Tento termín je mimo otváracích hodín; možnosť prevzatia vozidla musí overiť servis.", en: "This date is outside opening hours; the garage must check whether it can accept the vehicle.", ru: "Эта дата вне рабочих часов; возможность приёма автомобиля должен уточнить сервис.", uk: "Ця дата поза робочими годинами; можливість прийняти автомобіль має уточнити сервіс.", de: "Dieser Termin liegt außerhalb der Öffnungszeiten; die Werkstatt muss die Fahrzeugannahme prüfen." })[language] ?? closedDayNote("en");
}
