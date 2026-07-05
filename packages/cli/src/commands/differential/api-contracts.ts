import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import YAML from "yaml";
import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import type {
  DifferentialApiContractChange,
  DifferentialApiContractResult,
  DifferentialApiContractSide
} from "../../types";

const HTTP_METHODS = ["get", "head", "options", "post", "put", "patch", "delete"] as const;
const JSON_MEDIA_TYPES = ["application/json", "application/*+json", "*/*"];

interface ContractDocument {
  root: Record<string, unknown>;
  operations: Map<string, OperationContract>;
}

interface OperationContract {
  path: string;
  method: string;
  responses: Map<string, ResponseContract>;
  parameters: Map<string, ParameterContract>;
}

interface ResponseContract {
  fields: Map<string, SchemaField>;
}

interface ParameterContract {
  key: string;
  name: string;
  location: string;
  required: boolean;
}

interface SchemaField {
  path: string;
  required: boolean;
  schemaPath: string;
}

interface ContractSideRead {
  side: DifferentialApiContractSide;
  document?: ContractDocument | undefined;
  error?: string | undefined;
}

export function configuredOpenApiContractPaths(config: CodeDecayConfig): string[] {
  return dedupeStrings([
    ...config.apiContracts.openapi,
    ...(config.toolAdapters.schemathesis?.schema ? [config.toolAdapters.schemathesis.schema] : [])
  ]);
}

export function compareApiContracts(input: {
  baseWorktree: string;
  headWorktree: string;
  refs: { base: string; head: string };
  config: CodeDecayConfig;
}): DifferentialApiContractResult[] {
  return configuredOpenApiContractPaths(input.config).map((schemaPath) => {
    const base = readContractSide(input.baseWorktree, schemaPath);
    const head = readContractSide(input.headWorktree, schemaPath);
    const errors = [base.error, head.error].filter((item): item is string => Boolean(item));
    const result: DifferentialApiContractResult = {
      id: `openapi:${schemaPath}`,
      schemaPath,
      status: "passed",
      breakingChanges: [],
      nonBreakingChanges: [],
      errors,
      rerunCommand: `npx codedecay differential --base ${input.refs.base} --head ${input.refs.head} --format markdown`,
      base: base.side,
      head: head.side
    };

    if (errors.length > 0 || !base.document || !head.document) {
      result.status = "failed";
      return result;
    }

    const changes = diffOpenApiDocuments(base.document, head.document);
    result.breakingChanges = changes.filter((change) => change.severity === "breaking");
    result.nonBreakingChanges = changes.filter((change) => change.severity === "non-breaking");
    result.status = result.breakingChanges.length > 0 ? "changed" : "passed";
    return result;
  });
}

function readContractSide(worktreePath: string, schemaPath: string): ContractSideRead {
  const side: DifferentialApiContractSide = {
    schemaPath,
    exists: false,
    operationCount: 0
  };
  const resolved = resolveInside(worktreePath, schemaPath);
  if (!resolved) {
    return {
      side,
      error: `${schemaPath} resolves outside the worktree.`
    };
  }

  if (!existsSync(resolved)) {
    return {
      side,
      error: `${schemaPath} was not found.`
    };
  }

  side.exists = true;
  try {
    const parsed = parseOpenApiDocument(readFileSync(resolved, "utf8"), schemaPath);
    side.operationCount = parsed.operations.size;
    return {
      side,
      document: parsed
    };
  } catch (error: unknown) {
    return {
      side,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseOpenApiDocument(raw: string, schemaPath: string): ContractDocument {
  const parsed = YAML.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${schemaPath} is not a valid OpenAPI object.`);
  }

  const paths = readRecord(parsed.paths);
  if (!paths) {
    throw new Error(`${schemaPath} does not contain a paths object.`);
  }

  const document: ContractDocument = {
    root: parsed,
    operations: new Map()
  };

  for (const [apiPath, pathValue] of Object.entries(paths)) {
    const pathItem = readRecord(pathValue);
    if (!pathItem) {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const operation = readRecord(pathItem[method]);
      if (!operation) {
        continue;
      }

      const methodLabel = method.toUpperCase();
      document.operations.set(operationKey(apiPath, methodLabel), {
        path: apiPath,
        method: methodLabel,
        responses: collectResponses(document.root, apiPath, methodLabel, operation),
        parameters: collectParameters(pathItem, operation)
      });
    }
  }

  return document;
}

function diffOpenApiDocuments(base: ContractDocument, head: ContractDocument): DifferentialApiContractChange[] {
  const changes: DifferentialApiContractChange[] = [];
  const basePaths = pathsByDocument(base);
  const headPaths = pathsByDocument(head);

  for (const path of [...basePaths].sort()) {
    if (!headPaths.has(path)) {
      changes.push({
        kind: "removed-path",
        severity: "breaking",
        path,
        message: `Removed API path ${path}.`,
        base: "present",
        head: "missing"
      });
    }
  }

  for (const path of [...headPaths].sort()) {
    if (!basePaths.has(path)) {
      changes.push({
        kind: "added-path",
        severity: "non-breaking",
        path,
        message: `Added API path ${path}.`,
        base: "missing",
        head: "present"
      });
    }
  }

  for (const [key, baseOperation] of [...base.operations.entries()].sort()) {
    const headOperation = head.operations.get(key);
    if (!headOperation) {
      if (!headPaths.has(baseOperation.path)) {
        continue;
      }
      changes.push({
        kind: "removed-method",
        severity: "breaking",
        path: baseOperation.path,
        method: baseOperation.method,
        message: `Removed ${baseOperation.method} ${baseOperation.path}.`,
        base: "present",
        head: "missing"
      });
      continue;
    }

    changes.push(...diffOperation(baseOperation, headOperation));
  }

  for (const [key, headOperation] of [...head.operations.entries()].sort()) {
    if (base.operations.has(key) || !basePaths.has(headOperation.path)) {
      continue;
    }

    changes.push({
      kind: "added-method",
      severity: "non-breaking",
      path: headOperation.path,
      method: headOperation.method,
      message: `Added ${headOperation.method} ${headOperation.path}.`,
      base: "missing",
      head: "present"
    });
  }

  return changes;
}

function diffOperation(base: OperationContract, head: OperationContract): DifferentialApiContractChange[] {
  return [
    ...diffStatusCodes(base, head),
    ...diffResponseFields(base, head),
    ...diffParameters(base, head)
  ];
}

function diffStatusCodes(base: OperationContract, head: OperationContract): DifferentialApiContractChange[] {
  const changes: DifferentialApiContractChange[] = [];
  for (const statusCode of [...base.responses.keys()].sort()) {
    if (!head.responses.has(statusCode)) {
      changes.push({
        kind: "removed-status-code",
        severity: "breaking",
        path: base.path,
        method: base.method,
        statusCode,
        schemaPath: `paths.${base.path}.${base.method.toLowerCase()}.responses.${statusCode}`,
        message: `Removed ${statusCode} response from ${base.method} ${base.path}.`,
        base: "present",
        head: "missing"
      });
    }
  }

  for (const statusCode of [...head.responses.keys()].sort()) {
    if (!base.responses.has(statusCode)) {
      changes.push({
        kind: "added-status-code",
        severity: "non-breaking",
        path: head.path,
        method: head.method,
        statusCode,
        schemaPath: `paths.${head.path}.${head.method.toLowerCase()}.responses.${statusCode}`,
        message: `Added ${statusCode} response to ${head.method} ${head.path}.`,
        base: "missing",
        head: "present"
      });
    }
  }

  return changes;
}

function diffResponseFields(base: OperationContract, head: OperationContract): DifferentialApiContractChange[] {
  const changes: DifferentialApiContractChange[] = [];
  for (const [statusCode, baseResponse] of base.responses.entries()) {
    const headResponse = head.responses.get(statusCode);
    if (!headResponse) {
      continue;
    }

    for (const [fieldPath, baseField] of baseResponse.fields.entries()) {
      const headField = headResponse.fields.get(fieldPath);
      if (!headField) {
        changes.push({
          kind: "removed-response-field",
          severity: "breaking",
          path: base.path,
          method: base.method,
          statusCode,
          schemaPath: baseField.schemaPath,
          message: `Removed response field ${fieldPath} from ${base.method} ${base.path} ${statusCode}.`,
          base: baseField.required ? "required" : "optional",
          head: "missing"
        });
        continue;
      }

      if (baseField.required && !headField.required) {
        changes.push({
          kind: "response-required-field-removed",
          severity: "breaking",
          path: base.path,
          method: base.method,
          statusCode,
          schemaPath: baseField.schemaPath,
          message: `Response field ${fieldPath} is no longer required for ${base.method} ${base.path} ${statusCode}.`,
          base: "required",
          head: "optional"
        });
      }
    }

    for (const [fieldPath, headField] of headResponse.fields.entries()) {
      if (baseResponse.fields.has(fieldPath)) {
        continue;
      }

      changes.push({
        kind: headField.required ? "response-required-field-added" : "added-response-field",
        severity: "non-breaking",
        path: head.path,
        method: head.method,
        statusCode,
        schemaPath: headField.schemaPath,
        message: `Added ${headField.required ? "required " : ""}response field ${fieldPath} to ${head.method} ${head.path} ${statusCode}.`,
        base: "missing",
        head: headField.required ? "required" : "optional"
      });
    }
  }

  return changes;
}

function diffParameters(base: OperationContract, head: OperationContract): DifferentialApiContractChange[] {
  const changes: DifferentialApiContractChange[] = [];
  for (const [key, headParameter] of head.parameters.entries()) {
    const baseParameter = base.parameters.get(key);
    if (!baseParameter) {
      changes.push({
        kind: headParameter.required ? "required-request-parameter-added" : "optional-request-parameter-added",
        severity: headParameter.required ? "breaking" : "non-breaking",
        path: head.path,
        method: head.method,
        schemaPath: `paths.${head.path}.${head.method.toLowerCase()}.parameters.${key}`,
        message: `Added ${headParameter.required ? "required" : "optional"} ${headParameter.location} parameter ${headParameter.name} to ${head.method} ${head.path}.`,
        base: "missing",
        head: headParameter.required ? "required" : "optional"
      });
      continue;
    }

    if (!baseParameter.required && headParameter.required) {
      changes.push({
        kind: "request-parameter-became-required",
        severity: "breaking",
        path: head.path,
        method: head.method,
        schemaPath: `paths.${head.path}.${head.method.toLowerCase()}.parameters.${key}`,
        message: `${headParameter.location} parameter ${headParameter.name} became required for ${head.method} ${head.path}.`,
        base: "optional",
        head: "required"
      });
    }
  }

  return changes;
}

function collectResponses(
  root: Record<string, unknown>,
  apiPath: string,
  method: string,
  operation: Record<string, unknown>
): Map<string, ResponseContract> {
  const responses = readRecord(operation.responses);
  const result = new Map<string, ResponseContract>();
  if (!responses) {
    return result;
  }

  for (const [statusCode, responseValue] of Object.entries(responses)) {
    const response = readRecord(responseValue);
    const schema = response ? selectResponseSchema(response) : undefined;
    result.set(statusCode, {
      fields: schema
        ? collectSchemaFields(root, schema, `paths.${apiPath}.${method.toLowerCase()}.responses.${statusCode}.content.application/json.schema`)
        : new Map()
    });
  }

  return result;
}

function selectResponseSchema(response: Record<string, unknown>): Record<string, unknown> | undefined {
  const content = readRecord(response.content);
  if (!content) {
    return undefined;
  }

  for (const mediaType of JSON_MEDIA_TYPES) {
    const media = readRecord(content[mediaType]);
    const schema = readRecord(media?.schema);
    if (schema) {
      return schema;
    }
  }

  for (const media of Object.values(content)) {
    const schema = readRecord(readRecord(media)?.schema);
    if (schema) {
      return schema;
    }
  }

  return undefined;
}

function collectParameters(pathItem: Record<string, unknown>, operation: Record<string, unknown>): Map<string, ParameterContract> {
  const parameters = [
    ...readArray(pathItem.parameters),
    ...readArray(operation.parameters)
  ];
  const result = new Map<string, ParameterContract>();

  for (const parameterValue of parameters) {
    const parameter = readRecord(parameterValue);
    if (!parameter) {
      continue;
    }

    const name = typeof parameter.name === "string" ? parameter.name : undefined;
    const location = typeof parameter.in === "string" ? parameter.in : undefined;
    if (!name || !location) {
      continue;
    }

    const key = `${location}:${name}`;
    result.set(key, {
      key,
      name,
      location,
      required: parameter.required === true || location === "path"
    });
  }

  return result;
}

function collectSchemaFields(
  root: Record<string, unknown>,
  schema: Record<string, unknown>,
  schemaPath: string,
  prefix = "",
  seenRefs = new Set<string>()
): Map<string, SchemaField> {
  const resolved = resolveSchema(root, schema, seenRefs);
  const objectSchema = readRecord(resolved.type === "array" ? readRecord(resolved.items) : resolved);
  const result = new Map<string, SchemaField>();
  if (!objectSchema) {
    return result;
  }

  const properties = readRecord(objectSchema.properties);
  if (!properties) {
    return result;
  }

  const required = new Set(readArray(objectSchema.required).filter((item): item is string => typeof item === "string"));
  for (const [name, value] of Object.entries(properties)) {
    const propertySchema = readRecord(value);
    const fieldPath = prefix ? `${prefix}.${name}` : name;
    const fieldSchemaPath = `${schemaPath}.properties.${name}`;
    result.set(fieldPath, {
      path: fieldPath,
      required: required.has(name),
      schemaPath: fieldSchemaPath
    });

    if (propertySchema) {
      for (const nested of collectSchemaFields(root, propertySchema, fieldSchemaPath, fieldPath, new Set(seenRefs)).values()) {
        result.set(nested.path, nested);
      }
    }
  }

  return result;
}

function resolveSchema(
  root: Record<string, unknown>,
  schema: Record<string, unknown>,
  seenRefs: Set<string>
): Record<string, unknown> {
  const ref = typeof schema.$ref === "string" ? schema.$ref : undefined;
  if (!ref || !ref.startsWith("#/") || seenRefs.has(ref)) {
    return schema;
  }

  const resolved = resolveJsonPointer(root, ref);
  if (!resolved) {
    return schema;
  }

  seenRefs.add(ref);
  return resolveSchema(root, resolved, seenRefs);
}

function resolveJsonPointer(root: Record<string, unknown>, ref: string): Record<string, unknown> | undefined {
  let current: unknown = root;
  for (const rawSegment of ref.slice(2).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    current = readRecord(current)?.[segment];
  }

  return readRecord(current);
}

function pathsByDocument(document: ContractDocument): Set<string> {
  return new Set([...document.operations.values()].map((operation) => operation.path));
}

function operationKey(path: string, method: string): string {
  return `${method} ${path}`;
}

function resolveInside(rootDir: string, path: string): string | undefined {
  const rootPath = resolve(rootDir);
  const fullPath = resolve(rootPath, path);
  const relativePath = relative(rootPath, fullPath);
  return relativePath.startsWith("..") || isAbsolute(relativePath) ? undefined : fullPath;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
