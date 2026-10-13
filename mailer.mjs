import nodemailer from "nodemailer";

const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

const mailer = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: appPassword
  },
  connectionTimeout: 10_000,
  socketTimeout: 15_000
});

function line(value) {
  return String(value ?? "neuvedeno")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export async function sendServiceRequest(intake, company, requestId) {
  const recipient = process.env.LEADS_TO_EMAIL;

  if (!process.env.GMAIL_USER || !appPassword || !recipient) {
    throw new Error("E-mail není nakonfigurován.");
  }
  if (appPassword.length !== 16) {
    throw new Error("GMAIL_APP_PASSWORD musí být 16znakové heslo aplikace Google.");
  }

  const service = company.services.find(
    (item) => item.id === intake.serviceId
  );
  const option = service?.options?.find(
    (item) => item.id === intake.serviceOptionId
  );

  const text = [
    `Žádost: ${requestId}`,
    `Služba: ${line(intake.requestedWork || option?.name || service?.name)}`,
    `Vozidlo: ${line(intake.vehicle.brand)} ${line(intake.vehicle.model)}, rok ${line(intake.vehicle.year)}`,
    `Motor: ${line(intake.vehicle.engine)}`,
    `Popis problému: ${line(intake.problem.description)}`,
    `Kdy se projevuje: ${line(intake.problem.when)}`,
    `Další příznaky: ${line(intake.problem.otherSymptoms)}`,
    `Kontrolky: ${line(intake.problem.warningLights)}`,
    `Kamera/senzory u skla: ${
      intake.vehicle.windshieldSensors === null
        ? "neuvedeno"
        : intake.vehicle.windshieldSensors ? "ano" : "ne"
    }`,
    `Preferovaný termín: ${line(intake.preferredTime)}`,
    `Jméno: ${line(intake.customer.name)}`,
    `Telefon: ${line(intake.customer.phone)}`,
    `E-mail zákazníka: ${line(intake.customer.email)}`,
    "",
    "Preferovaný termín není potvrzenou rezervací."
  ].join("\n");

  const result = await mailer.sendMail({
    from: process.env.GMAIL_USER,
    to: recipient,
    subject: `Nová žádost o servis — ${requestId.slice(0, 8)}`,
    text
  });

  if (
    !result.accepted?.some(
      (address) => address.toLowerCase() === recipient.toLowerCase()
    )
  ) {
    throw new Error("Poštovní server nepřijal adresu příjemce.");
  }
}
