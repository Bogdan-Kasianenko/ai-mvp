const guideTool = {
  type: "function",
  name: "select_guide",
  description:
    "Tento nástroj použij pouze pro načtení guide noStart při potížích se startováním nebo uvedením vozu do stavu připraveného k jízdě. U ostatních témat rovnou odpověz bez volání nástroje.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      guideId: {
        type: "string",
        enum: ["noStart"],
      },
    },
    required: ["guideId"],
    additionalProperties: false,
  },
};

const selectionRules = `
VÝBĚR ODBORNÉHO GUIDE
Pro potíže se startováním použij select_guide s guideId=noStart před odborným vysvětlením a otázkami tohoto scénáře, pokud guide ještě není aktivní. Rozhoduj podle významu rozhovoru, nikoli přesných slov.
Pokud je guide aktivní, jeho pravidla a znalosti již máš. O jeho zachování rozhodni v interním poli guideAction: keep pro pokračování stejné potíže, clear pro ukončení nebo přechod k nesouvisejícímu tématu.
Krátká odpověď na předchozí otázku, doplnění vozidla, odtah a objednání kontroly stejné potíže znamenají keep. Samostatný požadavek na jinou službu nebo výslovná změna tématu znamenají clear. Pouhý vedlejší informační dotaz nemusí původní potíž ukončit; rozhodni podle kontextu.
Bezprostřední bezpečnostní pokyny mají přednost před načítáním guide. Načtení guide není objednávka, souhlas ani potvrzení diagnózy.
Odpověz v předepsaném JSON schématu. Interní výběr guide zákazníkovi nepopisuj. guideAction vyplň pouze tehdy, když je součástí schématu.
`;

function replyFormat(format, active) {
  if (!active) return format;

  if (format?.type !== "json_schema" || !format.schema) {
    throw new Error("Active guide requires a JSON response schema");
  }

  return {
    ...format,
    schema: {
      ...format.schema,
      properties: {
        ...format.schema.properties,
        guideAction: {
          type: "string",
          enum: ["keep", "clear"],
          description:
            "keep: pokračování stejné potíže včetně krátkých odpovědí, odtahu a objednání její kontroly. clear: zákazník tuto potíž ukončil nebo přešel k nesouvisejícímu požadavku.",
        },
      },
      required: [
        ...format.schema.required.filter(
          name => name !== "guideAction",
        ),
        "guideAction",
      ],
    },
  };
}

export async function respondWithGuide({
  params,
  createResponse,
  signal,
  activeGuide = null,
  instructionsForGuide,
}) {
  let selected = activeGuide === "noStart" ? "noStart" : null;

  const instructions = () =>
    instructionsForGuide(selected) +
    selectionRules +
    "\nAktivní guide: " +
    (selected ?? "none");

  let request = {
    ...params,
    instructions: instructions(),
    text: {
      ...params.text,
      format: replyFormat(
        params.text?.format,
        selected === "noStart",
      ),
    },
    tools: selected ? [] : [guideTool],
    tool_choice: selected ? "none" : "auto",
    parallel_tool_calls: false,
  };

  let response = await createResponse(request, { signal });

  const calls =
    response?.output?.filter(
      item => item.type === "function_call",
    ) ?? [];

  if (response?.status === "completed" && calls.length > 0) {
    const call = calls[0];
    let args;

    try {
      args = JSON.parse(call.arguments);
    } catch {
      return { response: null, activeGuide: selected, request };
    }

    if (
      selected !== null ||
      calls.length !== 1 ||
      call.name !== "select_guide" ||
      typeof call.call_id !== "string" ||
      !call.call_id ||
      !args ||
      Array.isArray(args) ||
      typeof args !== "object" ||
      Object.keys(args).length !== 1 ||
      args.guideId !== "noStart"
    ) {
      return { response: null, activeGuide: selected, request };
    }

    selected = "noStart";

    request = {
      ...request,
      instructions: instructions(),
      text: {
        ...params.text,
        format: replyFormat(params.text?.format, true),
      },
      input: [
        ...request.input,
        ...response.output,
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            activeGuide: selected,
            status: "loaded",
          }),
        },
      ],
      tools: [],
      tool_choice: "none",
    };

    response = await createResponse(request, { signal });

    if (
      response?.output?.some(
        item => item.type === "function_call",
      )
    ) {
      return { response: null, activeGuide: selected, request };
    }
  }

  const refused = response?.output?.some(
    item =>
      item.type === "message" &&
      item.content?.some(part => part.type === "refusal"),
  );

  if (
    response?.status === "completed" &&
    selected === "noStart" &&
    !refused
  ) {
    let data;

    try {
      data = JSON.parse(response.output_text);
    } catch {
      return { response: null, activeGuide: selected, request };
    }

    if (!data || !["keep", "clear"].includes(data.guideAction)) {
      return { response: null, activeGuide: selected, request };
    }

    if (data.guideAction === "clear") {
      selected = null;
    }

    delete data.guideAction;

    response = {
      ...response,
      output_text: JSON.stringify(data),
    };
  }

  return {
    response,
    activeGuide: selected,
    request: {
      ...request,
      instructions: instructionsForGuide(selected),
      text: params.text,
      tools: [],
      tool_choice: "none",
    },
  };
}