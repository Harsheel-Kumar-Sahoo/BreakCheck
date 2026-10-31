export type ElementKind = "operation" | "parameter" | "requestField" | "response" | "responseField";

// Everything we compare lives in attrs. Adding a new thing to compare = add a field here.
export interface Attrs {
  required?: boolean;
  type?: string;
  nullable?: boolean;
  enum?: string[];
  default?: unknown;
  deprecated?: boolean;
  auth?: string[];        // operations only: names of security schemes
  description?: string;
}

export interface ApiElement {
  key: string;            // "GET /orders/{id}#response.200.field:total"
  kind: ElementKind;
  method: string;         // "GET"
  path: string;           // "/orders/{id}"
  target?: string;        // "total" or "query:status": what the consumer map matches on
  statusCode?: string;    // "200"
  attrs: Attrs;
}