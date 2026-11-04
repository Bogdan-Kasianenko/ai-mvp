// Test-only metadata for valid provider responses to the request's guide schema.
export function withGuideActions(request, payload) {
  const value = structuredClone(payload);
  const actions = request.text.format.schema.properties.guideActions?.properties;
  if (actions && !Object.hasOwn(value, "guideActions")) {
    value.guideActions = Object.fromEntries(Object.keys(actions).map(id => [id, "keep"]));
  }
  return value;
}
