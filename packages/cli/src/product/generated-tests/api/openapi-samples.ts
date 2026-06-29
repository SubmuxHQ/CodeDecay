import type {
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiSchema
} from "../openapi";

export function sampleOpenApiRequestBody(operation: OpenApiOperation): unknown {
  const content = operation.requestBody?.content;
  const jsonMedia = content?.["application/json"] ?? content?.["application/problem+json"] ?? Object.values(content ?? {}).find(Boolean);
  if (!jsonMedia) {
    return {
      codedecay: "review-before-running"
    };
  }

  if (jsonMedia.example !== undefined) {
    return jsonMedia.example;
  }

  return sampleOpenApiSchemaValue(jsonMedia.schema);
}

export function sampleOpenApiOperationPath(path: string, pathItem: OpenApiPathItem, operation: OpenApiOperation): string {
  const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
  const replacedPath = path.replace(/\{([^}]+)\}/g, (_match, name: string) => encodeURIComponent(String(sampleOpenApiParameterValue(name, parameters))));
  const query = new URLSearchParams();

  for (const parameter of parameters) {
    if (parameter.in !== "query" || !parameter.name || parameter.required !== true) {
      continue;
    }

    query.set(parameter.name, String(sampleOpenApiParameterValue(parameter.name, parameters)));
  }

  const queryString = query.toString();
  return queryString ? `${replacedPath}?${queryString}` : replacedPath;
}

export function openApiExpectedStatuses(operation: OpenApiOperation): number[] {
  return Object.keys(operation.responses ?? {})
    .filter((status) => /^\d{3}$/.test(status))
    .map((status) => Number(status))
    .filter((status) => status >= 100 && status < 500)
    .sort((left, right) => left - right);
}

function sampleOpenApiSchemaValue(schema: OpenApiSchema | undefined): unknown {
  if (!schema) {
    return {
      codedecay: "review-before-running"
    };
  }

  if (schema.example !== undefined) {
    return schema.example;
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  if (schema.type === "array") {
    return [sampleOpenApiSchemaValue(schema.items)];
  }

  if (schema.type === "integer" || schema.type === "number") {
    return 1;
  }

  if (schema.type === "boolean") {
    return true;
  }

  if (schema.type === "string") {
    if (schema.format === "email") {
      return "codedecay@example.com";
    }

    if (schema.format === "uri" || schema.format === "url") {
      return "https://example.com";
    }

    if (schema.format === "uuid") {
      return "00000000-0000-4000-8000-000000000001";
    }

    return "codedecay";
  }

  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? Object.keys(properties));
  const value: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    if (!required.has(name)) {
      continue;
    }

    value[name] = sampleOpenApiSchemaValue(property);
  }

  return Object.keys(value).length > 0 ? value : { codedecay: "review-before-running" };
}

function sampleOpenApiParameterValue(name: string, parameters: OpenApiParameter[]): string | number | boolean {
  const parameter = parameters.find((candidate) => candidate.name === name);
  const schema = parameter?.schema;
  const lowerName = name.toLowerCase();

  if (parameter?.example !== undefined) {
    return primitiveSampleValue(parameter.example);
  }

  if (schema?.example !== undefined) {
    return primitiveSampleValue(schema.example);
  }

  if (schema?.default !== undefined) {
    return primitiveSampleValue(schema.default);
  }

  if (Array.isArray(schema?.enum) && schema.enum.length > 0) {
    return primitiveSampleValue(schema.enum[0]);
  }

  if (schema?.type === "integer" || schema?.type === "number" || /\b(id|count|page|limit|offset)\b/i.test(lowerName)) {
    return 1;
  }

  if (schema?.type === "boolean") {
    return true;
  }

  if (schema?.format === "email" || lowerName.includes("email")) {
    return "codedecay@example.com";
  }

  if (schema?.format === "uuid" || lowerName.includes("uuid")) {
    return "00000000-0000-4000-8000-000000000001";
  }

  return "codedecay";
}

function primitiveSampleValue(value: unknown): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return "codedecay";
  }

  return JSON.stringify(value);
}
