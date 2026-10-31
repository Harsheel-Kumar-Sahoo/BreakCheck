import SwaggerParser from "@apidevtools/swagger-parser";

// Replaces every {"$ref": "..."} with the real content.
// external:false = same safety rule as Phase 2. circular:"ignore" = a self-referencing schema
// (e.g. a tree) keeps its $ref instead of making an infinite object.
export async function dereferenceSpec(doc: any): Promise<any> {
  return SwaggerParser.dereference(structuredClone(doc), {
    resolve: { external: false },
    dereference: { circular: "ignore" },
  } as any);
}