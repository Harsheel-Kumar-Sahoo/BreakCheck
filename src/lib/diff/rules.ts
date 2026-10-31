import type { ApiElement, Attrs, ElementKind } from "../spec/types";

export type Severity = "breaking" | "potential" | "safe";
export type Impact = "operation" | "element" | "missing" | "none";

export interface DiffCtx { afterPaths: Set<string> } // paths that still exist in the new version

export interface Rule {
  changeType: string;
  kind: ElementKind;
  severity: Severity;
  impact: Impact;
  title: string;
  // b = attributes BEFORE (undefined if the element didn't exist), a = AFTER.
  when: (b: Attrs | undefined, a: Attrs | undefined, ctx: DiffCtx, el: ApiElement) => boolean;
  detail?: (b?: Attrs, a?: Attrs) => Record<string, unknown>;
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
const removedEnum = (b?: Attrs, a?: Attrs): string[] => (b?.enum && a?.enum ? b.enum.filter((v) => !a.enum!.includes(v)) : []);
const addedEnum = (b?: Attrs, a?: Attrs): string[] => removedEnum(a, b); // "added" = "removed" with the arguments swapped

// ---------------------------------------------------------------------------
// INPUT direction: things the consumer SENDS (query/header/path params, request body fields).
// Both kinds share the same logic, so we generate the rules for each.
// Only difference: removing a whole param is breaking, removing a body field is just "potential".
// ---------------------------------------------------------------------------
function inputRules(kind: "parameter" | "requestField", name: string, label: string, onRemove: Severity): Rule[] {
  return [
    { changeType: `${name}_removed`, kind, severity: onRemove, impact: "element", title: `${label} removed`,
      when: (b, a) => !!b && !a },
    { changeType: `${name}_added_required`, kind, severity: "breaking", impact: "missing", title: `New required ${label.toLowerCase()}`,
      when: (b, a) => !b && !!a?.required },
    { changeType: `${name}_added_optional`, kind, severity: "safe", impact: "none", title: `New optional ${label.toLowerCase()}`,
      when: (b, a) => !b && !!a && !a.required },
    { changeType: `${name}_became_required`, kind, severity: "breaking", impact: "element", title: `${label} became required`,
      when: (b, a) => !!b && !!a && !b.required && !!a.required },
    { changeType: `${name}_became_optional`, kind, severity: "safe", impact: "none", title: `${label} became optional`,
      when: (b, a) => !!b && !!a && !!b.required && !a.required },
    { changeType: `${name}_type_changed`, kind, severity: "breaking", impact: "element", title: `${label} type changed`,
      when: (b, a) => !!b && !!a && b.type !== a.type },
    // Request side: REMOVING an allowed value breaks consumers; ADDING one is harmless.
    { changeType: `${name === "param" ? "param" : "request"}_enum_value_removed`, kind, severity: "breaking", impact: "element",
      title: `Allowed value removed from ${label.toLowerCase()}`,
      when: (b, a) => removedEnum(b, a).length > 0, detail: (b, a) => ({ values: removedEnum(b, a) }) },
    { changeType: `${name === "param" ? "param" : "request"}_enum_value_added`, kind, severity: "safe", impact: "none",
      title: `Allowed value added to ${label.toLowerCase()}`,
      when: (b, a) => addedEnum(b, a).length > 0, detail: (b, a) => ({ values: addedEnum(b, a) }) },
    { changeType: `${name}_default_changed`, kind, severity: "potential", impact: "element", title: `${label} default changed`,
      when: (b, a) => !!b && !!a && !same(b.default, a.default) },
  ];
}

export const RULES: Rule[] = [
  // ---- operations (endpoint + HTTP method) ----
  { changeType: "endpoint_removed", kind: "operation", severity: "breaking", impact: "operation", title: "Endpoint removed",
    when: (b, a, ctx, el) => !!b && !a && !ctx.afterPaths.has(el.path) },
  { changeType: "method_removed", kind: "operation", severity: "breaking", impact: "operation", title: "HTTP method removed",
    when: (b, a, ctx, el) => !!b && !a && ctx.afterPaths.has(el.path) }, // path survives, this method doesn't
  { changeType: "endpoint_added", kind: "operation", severity: "safe", impact: "none", title: "New endpoint",
    when: (b, a) => !b && !!a },
  { changeType: "endpoint_deprecated", kind: "operation", severity: "potential", impact: "operation", title: "Endpoint deprecated",
    when: (b, a) => !!b && !!a && !b.deprecated && !!a.deprecated },
  { changeType: "auth_added", kind: "operation", severity: "breaking", impact: "operation", title: "Auth requirement added",
    when: (b, a) => !!b && !!a && (a.auth ?? []).some((s) => !(b.auth ?? []).includes(s)),
    detail: (b, a) => ({ added: (a?.auth ?? []).filter((s) => !(b?.auth ?? []).includes(s)) }) },

  // ---- response status codes ----
  { changeType: "response_status_removed", kind: "response", severity: "breaking", impact: "operation", title: "Response status code removed",
    when: (b, a) => !!b && !a },
  { changeType: "response_status_added", kind: "response", severity: "safe", impact: "none", title: "Response status code added",
    when: (b, a) => !b && !!a },

  // ---- INPUT direction ----
  ...inputRules("parameter", "param", "Request parameter", "breaking"),
  ...inputRules("requestField", "request_field", "Request field", "potential"),

  // ---- OUTPUT direction: things the consumer READS ----
  { changeType: "response_field_removed", kind: "responseField", severity: "breaking", impact: "element", title: "Response field removed",
    when: (b, a) => !!b && !a },
  { changeType: "response_field_added", kind: "responseField", severity: "safe", impact: "none", title: "Response field added",
    when: (b, a) => !b && !!a },
  { changeType: "response_field_type_changed", kind: "responseField", severity: "breaking", impact: "element", title: "Response field type changed",
    when: (b, a) => !!b && !!a && b.type !== a.type },
  // Response side is the MIRROR of the request side: ADDING a value can surprise readers, REMOVING is harmless.
  { changeType: "response_enum_value_added", kind: "responseField", severity: "potential", impact: "element", title: "New value in response enum",
    when: (b, a) => addedEnum(b, a).length > 0, detail: (b, a) => ({ values: addedEnum(b, a) }) },
  { changeType: "response_enum_value_removed", kind: "responseField", severity: "safe", impact: "none", title: "Value removed from response enum",
    when: (b, a) => removedEnum(b, a).length > 0, detail: (b, a) => ({ values: removedEnum(b, a) }) },
  { changeType: "response_field_became_nullable", kind: "responseField", severity: "potential", impact: "element", title: "Response field can now be null",
    when: (b, a) => !!b && !!a && !b.nullable && !!a.nullable },
  { changeType: "response_field_became_optional", kind: "responseField", severity: "potential", impact: "element", title: "Response field no longer guaranteed",
    when: (b, a) => !!b && !!a && !!b.required && !a.required },
  { changeType: "response_field_default_changed", kind: "responseField", severity: "potential", impact: "element", title: "Response field default changed",
    when: (b, a) => !!b && !!a && !same(b.default, a.default) },

  // ---- description-only edits are always safe ----
  ...(["operation", "parameter", "requestField", "responseField"] as ElementKind[]).map((kind): Rule => ({
    changeType: "description_changed", kind, severity: "safe", impact: "none", title: "Description changed",
    when: (b, a) => !!b && !!a && b.description !== a.description,
  })),
];