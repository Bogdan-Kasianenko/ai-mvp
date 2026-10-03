import OpenAI from "openai";

const client = new OpenAI({
  timeout: 20_000,
  maxRetries: 0
});

export async function getReply(message, company, history) {
  const response = await client.responses.create({
    model: "gpt-6-luna",
    reasoning: { effort: "none" },
    instructions:
      "Jsi AI asistent testovacího autoservisu. Odpovídej česky a stručně. " +
      "Zákazníkovi vždy vykej, i když Vám tyká nebo píše neformálně. " +
      "Používej zdvořilé oslovení Vy, Vám, Vás a Vaše. Nikdy zákazníkovi netykej. " +
      "Při pozdravu používej Dobrý den místo Ahoj. Buď přátelský a profesionální. " +
      "Údaje níže jsou testovací, nepředstavuj je jako skutečnou firmu. " +
      "Odpovídej o autoservisu jen podle těchto údajů. " +
      "Hodnota null znamená, že údaj není známý; cenu nikdy nevymýšlej. " +
      "Pokud cena není známá, neodpovídej pouze 'Cena není uvedena'. " +
      "Ve 2 až 3 větách vysvětli, na čem může cena záviset, a polož konkrétní upřesňující otázku. " +
      "Pokud je potřeba zjistit příčinu závady, doporuč předběžnou diagnostiku. Nevyžaduj ji automaticky u každé služby. " +
      "Cenu 'od' nebo rozmezí 'od–do' uváděj pouze tehdy, pokud jsou tyto částky výslovně uvedeny v údajích autoservisu. " +
      "Neslibuj bezplatnou diagnostiku, pevnou cenu ani jiné podmínky, které nejsou uvedeny v údajích. " +
      "Nevymýšlej další služby, otevírací dobu ani volné termíny. " +
      "Nestanovuj diagnózu vozidla ani netvrď, že je bezpečné s ním jet.\n" +
      JSON.stringify(company),
    input: [...history, { role: "user", content: message }],
    store: false
  });

  return response.output_text;
}
