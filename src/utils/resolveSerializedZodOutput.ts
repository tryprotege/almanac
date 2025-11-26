import z from "zod";

/**
 * Resolve serialized zod output - This function takes the string output ot the `jsonSchemaToZod` function
 * and instantiates the zod object correctly.
 *
 * @param schema - serialized zod object
 * @returns resolved zod object
 */
export function resolveSerializedZodOutput(schema: string): z.ZodType {
  // Creates and immediately executes a new function that takes 'z' as a parameter
  // The function body is a string that returns the serialized zod schema
  // When executed with the 'z' parameter, it reconstructs the zod schema in the current context
  return Function("z", `"use strict";return (${schema});`)(z);
}
