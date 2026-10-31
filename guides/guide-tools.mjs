import { guideRegistry, normalizeGuideIds } from "./registry.mjs";

const selectionRules = `
VÝBĚR ODBORNÝCH GUIDES
Podle významu aktuální zprávy a kontextu rozhovoru načti přes load_guides všechny odpovídající dostupné guides v jednom volání ještě před odpovědí zákazníkovi. Guide služby použij již při jejím prvním projednávání nebo přidání k jiné práci, i když služba zatím není v selectedOperations a odpověď vypadá jednoduše.

Pokud zákazník nově řeší přezutí pneumatik, výměnu kompletních kol nebo jejich cenu, načti dostupný guide tires před odpovědí i před položením upřesňující otázky. Platí to také při přidání pneumatik k již rozpracované výměně oleje. Již načtený guide znovu nevolej.
Pokud zákazník nově řeší výměnu oleje nebo některého filtru, nabídku filtrů, jejich cenu či dodání materiálu pro tyto práce, načti dostupný guide oilFilters před odpovědí i před upřesňující otázkou. Platí to také při přidání oleje nebo filtrů k jiné práci. Potřebuje-li aktuální zpráva olej i pneumatiky, načti oba dostupné guides v jednom volání. Již načtené guides znovu nevolej.

Pokud zákazník řeší nesprávně natankované palivo, odtahovou službu nebo její kontakt, načti dostupný guide wrongFuelTowing. Platí to také při nabídce nebo předání kontaktu v návaznosti na jinou závadu. Bezprostřední bezpečnostní pokyny mají přednost před načítáním. Již načtený guide znovu nevolej; navazující krátké odpovědi zpracuj s jeho dosavadním kontextem.
Načtení není výběrem služby, změnou dodání dílů ani souhlasem s objednáním.
Již načtené guides jsou v instrukcích; znovu je nenačítej. Krátká odpověď, doplnění vozidla a navazující odtah nebo kontrola stejné potíže zachovávají příslušný guide.
V interním guideActions vrať keep pro guides potřebné k právě řešenému tématu. U dočasného guide vrať clear, když zákazník téma ukončí, odloží nebo přejde k jiné potíži, i když původní závada zůstává nevyřešená. Například „cukání teď neřešme“ znamená clear pro guide cukání. Ostatní právě potřebné guides zachovej.

clear pouze vypíná přidávání pravidel a znalostí guide do dalších požadavků; neznamená opravenou závadu ani smazání historie, údajů vozidla nebo vybraných prací. Změny intake řiď skutečným požadavkem zákazníka a pravidly pro novou žádost, nikoli samotným clear.
Guides označené jako povinné patří ke skutečně vybraným pracím a mají pouze keep. Výběr nebo odebrání práce zaznamenej do intake podle skutečného přání zákazníka; pouhé načtení guide jej nemění.
Bezprostřední bezpečnostní pokyny mají přednost před načítáním. Odpověz v předepsaném JSON schématu. Interní správu guides zákazníkovi nepopisuj. guideActions vyplň pouze tehdy, když je součástí schématu.
`;

function replyFormat(format, loaded, required) {
  if (!loaded.length) return format;

  if (format?.type !== "json_schema" || !format.schema) {
    throw new Error("Active guides require a JSON response schema");
  }

  return {
    ...format,
    schema: {
      ...format.schema,
      properties: {
        ...format.schema.properties,
        guideActions: {
          type: "object",
          properties: Object.fromEntries(loaded.map(id => [
            id,
            {
              type: "string",
              enum: required.includes(id) ? ["keep"] : ["keep", "clear"],
            },
          ])),
          required: loaded,
          additionalProperties: false,
        },
      },
      required: [
        ...format.schema.required.filter(name => name !== "guideActions"),
        "guideActions",
      ],
    },
  };
}

export async function respondWithGuides({
  params,
  createResponse,
  signal,
  activeGuides = [],
  requiredGuides = [],
  instructionsForGuides,
  registry = guideRegistry,
}) {
  const required = normalizeGuideIds(requiredGuides, registry);
  let selected = normalizeGuideIds(activeGuides, registry)
    .filter(id => !required.includes(id));

  const loaded = () =>
    normalizeGuideIds([...required, ...selected], registry);

  const instructions = () =>
    instructionsForGuides(loaded()) +
    selectionRules +
    "\nNačtené guides: " + JSON.stringify(loaded()) +
    "\nPovinné guides vybraných prací: " + JSON.stringify(required);

  const available = Object.keys(registry)
    .filter(id => !loaded().includes(id))
    .sort();

  const tools = available.length ? [{
    type: "function",
    name: "load_guides",
    description:
            "Před odpovědí načti všechny dostupné guides odpovídající právě řešenému tématu, včetně prvního dotazu nebo přidání služby k jiné práci. Vlastní znalost tématu nenahrazuje načtení guide. Pokud žádný dostupný guide neodpovídá tématu, rovnou odpověz. Dostupné guides: " +
      available.map(id => id + ": " + registry[id].description).join("; "),
    strict: true,
    parameters: {
      type: "object",
      properties: {
        guideIds: {
          type: "array",
          items: { type: "string", enum: available },
        },
      },
      required: ["guideIds"],
      additionalProperties: false,
    },
  }] : [];

  let request = {
    ...params,
    instructions: instructions(),
    text: {
      ...params.text,
      format: replyFormat(params.text?.format, loaded(), required),
    },
    tools,
    tool_choice: tools.length ? "auto" : "none",
    parallel_tool_calls: false,
  };

  const fail = () => ({
    response: null,
    activeGuides: [...selected],
    request,
  });

  let response = await createResponse(request, { signal });
  const calls =
    response?.output?.filter(item => item.type === "function_call") ?? [];

  if (response?.status === "completed" && calls.length) {
    const call = calls[0];
    let args;

    try {
      args = JSON.parse(call.arguments);
    } catch {
      return fail();
    }

    if (
      !tools.length ||
      calls.length !== 1 ||
      call.name !== "load_guides" ||
      typeof call.call_id !== "string" ||
      !call.call_id ||
      !args ||
      Array.isArray(args) ||
      typeof args !== "object" ||
      Object.keys(args).length !== 1 ||
      !Array.isArray(args.guideIds) ||
      new Set(args.guideIds).size !== args.guideIds.length ||
      args.guideIds.some(id => !available.includes(id))
    ) {
      return fail();
    }

    selected = normalizeGuideIds([...selected, ...args.guideIds], registry);

    request = {
      ...request,
      instructions: instructions(),
      text: {
        ...params.text,
        format: replyFormat(params.text?.format, loaded(), required),
      },
      input: [
        ...request.input,
        ...response.output,
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            loadedGuideIds: args.guideIds,
            activeGuideIds: loaded(),
          }),
        },
      ],
      tools: [],
      tool_choice: "none",
    };

    response = await createResponse(request, { signal });

    if (response?.output?.some(item => item.type === "function_call")) {
      return fail();
    }
  }

  const refused = response?.output?.some(
    item => item.type === "message" &&
      item.content?.some(part => part.type === "refusal"),
  );

  if (response?.status === "completed" && loaded().length && !refused) {
    let data;

    try {
      data = JSON.parse(response.output_text);
    } catch {
      return fail();
    }

    const actions = data?.guideActions;
    const ids = loaded();

    if (
      !actions ||
      typeof actions !== "object" ||
      Array.isArray(actions) ||
      Object.keys(actions).length !== ids.length ||
      ids.some(id =>
        !Object.hasOwn(actions, id) ||
        !(required.includes(id) ? ["keep"] : ["keep", "clear"])
          .includes(actions[id]))
    ) {
      return fail();
    }

    selected = selected.filter(id => actions[id] === "keep");
    delete data.guideActions;
    response = { ...response, output_text: JSON.stringify(data) };
  }

  return {
    response,
    activeGuides: selected,
    request: {
      ...request,
      instructions: instructionsForGuides(loaded()),
      text: params.text,
      tools: [],
      tool_choice: "none",
    },
  };
}
