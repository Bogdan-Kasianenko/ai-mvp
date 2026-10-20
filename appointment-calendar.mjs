const months = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];

const monthNames = [
  months,
  ["januára", "februára", "marca", "apríla", "mája", "júna", "júla", "augusta", "septembra", "októbra", "novembra", "decembra"],
  ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"],
  ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"],
  ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"],
];
const monthNumbers = new Map(monthNames.flatMap(names => names.map((name, index) => [name, index + 1])));

export function readAppointmentDate(value) {
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let year, month, day;
  if (match) [, year, month, day] = match;
  else {
    match = text.match(/^(\d{1,2})\s*[.,/]\s*(\d{1,2})\s*[.,/]\s*(\d{4})\.?$/);
    if (match) [, day, month, year] = match;
    else {
      match = text.toLocaleLowerCase("cs").match(/^(\d{1,2})(?:st|nd|rd|th)?\.?\s+(\p{L}+)\s+(\d{4})\.?$/u);
      if (match) {
        day = match[1]; month = monthNumbers.get(match[2]); year = match[3];
      } else {
        match = text.toLocaleLowerCase("cs").match(/^(\p{L}+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/u);
        if (!match) return null;
        month = monthNumbers.get(match[1]); day = match[2]; year = match[3];
      }
      if (!month) return null;
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
    preferenceValidation: inspectAppointmentPreference(intake.preferredTime, now),
    requested: appointmentDay(date, company),
    requiresFullDateConfirmation: Boolean(date && partial),
    currentPreference: appointmentDay(readAppointmentDate(intake.preferredTime), company),
    pendingClosedDate: appointmentDay(review?.date, company),
  };
}

export function reviewAppointment({ previous, next, message, company, review, keepClosedDay = false, now = new Date() }) {
  const explicit = isCompleteAppointmentInput(message) ? inspectAppointmentPreference(message, now) : null;
  const preference = explicit ?? inspectAppointmentPreference(next.preferredTime, now);
  if (!preference.valid && preference.kind !== "missing") {
    next.preferredTime = null;
    return { blocked: true, review: null, issue: preference };
  }
  const explicitDate = readAppointmentDate(message);
  const date = explicitDate ?? preference.date ?? (keepClosedDay ? review?.date : null);
  const checkedDate = date ? inspectAppointmentPreference(date, now) : null;
  if (checkedDate && !checkedDate.valid) {
    next.preferredTime = null;
    return { blocked: true, review: null, issue: checkedDate };
  }
  const info = appointmentDay(date, company);
  if (!info) return { blocked: false, review: review ?? null };
  if (!info.closed) {
    next.preferredTime = preference.date === date && preference.time ? date + " " + preference.time : date;
    return { blocked: false, review: null };
  }
  const alreadyReviewed = review?.date === date;
  if (alreadyReviewed && (review.accepted === true || keepClosedDay === true)) {
    next.preferredTime = preference.date === date && preference.time ? date + " " + preference.time : date;
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

export function pragueToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = name => parts.find(part => part.type === name).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function inspectAppointmentPreference(value, now = new Date()) {
  const text = String(value ?? "").trim();
  if (!text) return { kind: "missing", valid: false, date: null, text, reason: "missing" };
  let dateText = text;
  const timed = text.match(/^(.+?)\s+(?:(?:v|at|um|о|o)\s+)?(\d{1,2}):(\d{2})$/iu);
  if (timed) dateText = timed[1].trim();
  const date = readAppointmentDate(dateText);
  if (date) {
    if (timed && (Number(timed[2]) > 23 || Number(timed[3]) > 59)) {
      return { kind: "date", valid: false, date, text, reason: "time" };
    }
    return { kind: "date", valid: date >= pragueToday(now), date, text,
      time: timed ? `${timed[2].padStart(2, "0")}:${timed[3]}` : null,
      reason: date < pragueToday(now) ? "past" : null };
  }
  const numericDate = /\d{4}\s*-\s*\d{1,2}|\d{1,2}\s*[.,/]\s*\d{1,2}|\b\d{4}\b|^\d{1,2}\.?$/u.test(text);
  const monthName = (text.match(/\p{L}+/gu) ?? []).some(word => monthNumbers.has(word.toLocaleLowerCase("cs")));
  if (/^(?:včera|vcera|předevčírem|predevcirem|včera|predvčerom|yesterday|gestern|vorgestern|вчера|позавчера|вчора|позавчора|minulý týden|minuly tyden|minulý týždeň|last week|letzte woche|на прошлой неделе|минулого тижня)$/iu.test(text)) {
    return { kind: "date", valid: false, date: null, text, reason: "past" };
  }
  if (numericDate || monthName) {
    return { kind: "date", valid: false, date: null, text, reason: "invalid" };
  }
  // A wish without a calendar date stays a separate kind of preference.
  return { kind: "flexible", valid: true, date: null, text, reason: null };
}

export function isCompleteAppointmentInput(value) {
  const text = String(value ?? "").trim();
  return /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s*[.,/]\s*\d{1,2}\s*[.,/]\s*\d{4}\.?|\d{1,2}(?:st|nd|rd|th)?\.?\s+\p{L}+\s+\d{4}\.?|\p{L}+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})(?:\s+(?:(?:v|at|um|о|o)\s+)?\d{1,2}:\d{2})?$/iu.test(text);
}

export function appointmentIssueMessage(issue, language = "cs") {
  const texts = {
    cs: { past: "Toto datum už uplynulo. Jaký nový termín by Vám vyhovoval?", invalid: "Prosím upřesněte termín celým platným datem, například den, měsíc a rok. Tento údaj se nepodařilo ověřit.", time: "Čas není platný. Napište ho prosím ve formátu hodiny:minuty, například 10:30." },
    sk: { past: "Tento dátum už uplynul. Aký nový termín by Vám vyhovoval?", invalid: "Prosím, upresnite termín celým platným dátumom: deň, mesiac a rok. Tento údaj sa nepodarilo overiť.", time: "Čas nie je platný. Napíšte ho prosím vo formáte hodiny:minúty, napríklad 10:30." },
    en: { past: "That date has already passed. What new date would suit you?", invalid: "Please clarify the preferred date with a valid day, month and year. I could not verify this date.", time: "That time is not valid. Please use hours:minutes, for example 10:30." },
    ru: { past: "Эта дата уже прошла. Какой новый день вам подойдёт?", invalid: "Уточните, пожалуйста, полную корректную дату: день, месяц и год. Указанную дату не удалось проверить.", time: "Указано неверное время. Напишите его в формате часы:минуты, например 10:30." },
    uk: { past: "Ця дата вже минула. Який новий день Вам підійде?", invalid: "Уточніть, будь ласка, повну коректну дату: день, місяць і рік. Указану дату не вдалося перевірити.", time: "Указано неправильний час. Напишіть його у форматі години:хвилини, наприклад 10:30." },
    de: { past: "Dieses Datum liegt bereits in der Vergangenheit. Welcher neue Termin würde Ihnen passen?", invalid: "Bitte geben Sie ein vollständiges gültiges Datum mit Tag, Monat und Jahr an. Dieses Datum konnte ich nicht prüfen.", time: "Diese Uhrzeit ist ungültig. Bitte verwenden Sie Stunden:Minuten, zum Beispiel 10:30." },
  };
  const t = texts[language] ?? texts.en;
  return t[issue.reason] ?? t.invalid;
}
