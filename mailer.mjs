import nodemailer from "nodemailer";

const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

const mailer = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: appPassword,
  },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  dnsTimeout: 5_000,
  socketTimeout: 15_000,
});

function line(value) {
  return String(value ?? "neuvedeno")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function buildRequestEmail(intake, company, requestId) {
  const service = company.services.find((item) => item.id === intake.serviceId);
  const option = service?.options?.find(
    (item) => item.id === intake.serviceOptionId,
  );
  const parts =
    intake.customerParts === true
      ? "vlastní díly zákazníka"
      : intake.customerParts === false
        ? "díly zajistí servis"
        : "není potřeba / neuvedeno";
  return [
    `Žádost: ${line(requestId)}`,
    `Služba: ${line(intake.requestedWork || option?.name || service?.name)}`,
    `Vozidlo: ${line(intake.vehicle.brand)} ${line(intake.vehicle.model)}, rok ${line(intake.vehicle.year)}`,
        `Motor: ${
      intake.vehicle.engine
        ? line(intake.vehicle.engine)
        : intake.skipped.includes("vehicle.engine")
          ? "neuvedeno — servis musí upřesnit před výběrem materiálu"
          : "neuvedeno"
    }`,
        `Druh paliva: ${line(intake.vehicle.fuel)}`,
    `Nájezd: ${line(intake.vehicle.mileage)}`,
    `Díly: ${parts}`,
    `Poslední výměna oleje: ${line(intake.problem.lastOilChange)}`,
    `Popis problému: ${line(intake.problem.description)}`,
    `Kdy se projevuje: ${line(intake.problem.when)}`,
    `Další příznaky: ${line(intake.problem.otherSymptoms)}`,
    `Kontrolky: ${line(intake.problem.warningLights)}`,
    `Kamera/senzory u skla: ${intake.vehicle.windshieldSensors === null ? "neuvedeno" : intake.vehicle.windshieldSensors ? "ano" : "ne"}`,
    `Preferovaný termín: ${line(intake.preferredTime)}`,
    `Jméno: ${line(intake.customer.name)}`,
    `Telefon: ${line(intake.customer.phone)}`,
    `E-mail zákazníka: ${line(intake.customer.email)}`,
    "",
    "Preferovaný termín není potvrzenou rezervací.",
  ].join("\n");
}

export async function sendServiceRequest(
  intake,
  company,
  requestId,
  transport = mailer,
) {
  const recipient = process.env.LEADS_TO_EMAIL;

  if (!process.env.GMAIL_USER || !appPassword || !recipient) {
    throw Object.assign(new Error("E-mail není nakonfigurován."), {
      definiteFailure: true,
    });
  }
  if (appPassword.length !== 16) {
    throw Object.assign(
      new Error("GMAIL_APP_PASSWORD musí být 16znakové heslo aplikace Google."),
      { definiteFailure: true },
    );
  }

  const text = buildRequestEmail(intake, company, requestId);

  const result = await transport.sendMail({
    from: process.env.GMAIL_USER,
    to: recipient,
    subject: `Nová žádost o servis — ${requestId.slice(0, 8)}`,
    text,
  });

  if (
    !result.accepted?.some(
      (address) => address.toLowerCase() === recipient.toLowerCase(),
    )
  ) {
    throw Object.assign(
      new Error("Poštovní server nepřijal adresu příjemce."),
      { definiteFailure: true },
    );
  }
}
