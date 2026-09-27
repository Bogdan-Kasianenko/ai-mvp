import OpenAI from "openai";

const client = new OpenAI();

export async function getReply(message, company) {
  const response = await client.responses.create({
    model: "gpt-6-luna",
    reasoning: { effort: "none" },
  instructions:
  "Jsi AI asistent testovacího autoservisu. Odpovídej česky a stručně. " +
  "Údaje níže jsou testovací, nepředstavuj je jako skutečnou firmu. " +
  "Odpovídej o autoservisu jen podle těchto údajů. " +
  "Hodnota null znamená, že údaj není známý; cenu v tom případě nevymýšlej. " +
  "Nevymýšlej další služby, otevírací dobu ani volné termíny. " +
  "Nestanovuj diagnózu vozidla ani netvrď, že je bezpečné s ním jet.\n" +
  JSON.stringify(company),
    input: message,
    store: false
  });

  return response.output_text;
}