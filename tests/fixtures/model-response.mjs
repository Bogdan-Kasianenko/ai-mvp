// Neutral provider payload. Tests explicitly override the behavior they exercise.
export function createModelResponse(intake, overrides = {}) {
  return structuredClone({
    safetyWarning: "", reply: "Jasně.", language: "cs", priceQuoted: false,
    replyLead: "", tireUpdate: { reset: false, fields: [] },
    operationsAction: "replace", vehicleAction: "keep", vehicleFields: [],
    partsAction: "keep", oilPriceMode: "none", oilPriceRequests: [],
    tirePriceRequest: null, oilPriceFollowUp: "", keepClosedDay: false,
    needsClarification: false, statusFollowUp: "", intake, submissionAction: "none",
    ...overrides,
  });
}
