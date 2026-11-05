import { withGuideActions } from "./model-response.mjs";

// Provider envelope only: the test owns the payload and any tool-call sequence.
export function fakeModelResponse(request, payload) {
  return {
    status: "completed", output: [],
    output_text: JSON.stringify(withGuideActions(request, payload)),
  };
}
