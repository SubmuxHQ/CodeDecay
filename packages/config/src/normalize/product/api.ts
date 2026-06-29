import type { CodeDecayProductApiEndpoint, CodeDecayProductApiMethod } from "../../types";
import {
  isPlainObject,
  normalizeNonEmptyString,
  normalizeStringRecord
} from "../primitives";

export function normalizeProductApiEndpoints(value: unknown, field: string, sourcePath: string): CodeDecayProductApiEndpoint[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an array.`);
  }

  return value.map((endpoint, index) => normalizeProductApiEndpoint(endpoint, `${field}[${index}]`, sourcePath));
}

function normalizeProductApiEndpoint(value: unknown, field: string, sourcePath: string): CodeDecayProductApiEndpoint {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an object.`);
  }

  const method = normalizeProductApiMethod(value.method, `${field}.method`, sourcePath);
  const path = normalizeProductApiPath(value.path, `${field}.path`, sourcePath);
  const expectedStatuses = normalizeProductApiExpectedStatuses(value.expectedStatuses, `${field}.expectedStatuses`, sourcePath);
  const endpoint: CodeDecayProductApiEndpoint = {
    method,
    path,
    expectedStatuses
  };

  if (value.id !== undefined) {
    endpoint.id = normalizeNonEmptyString(value.id, `${field}.id`, sourcePath);
  }

  if (value.headers !== undefined) {
    endpoint.headers = normalizeStringRecord(value.headers, `${field}.headers`, sourcePath);
  }

  if (value.body !== undefined) {
    endpoint.body = value.body;
  }

  return endpoint;
}

function normalizeProductApiMethod(value: unknown, field: string, sourcePath: string): CodeDecayProductApiMethod {
  const text = normalizeNonEmptyString(value, field, sourcePath).toUpperCase();
  if (["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(text)) {
    return text as CodeDecayProductApiMethod;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be one of GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE.`);
}

function normalizeProductApiPath(value: unknown, field: string, sourcePath: string): string {
  const text = normalizeNonEmptyString(value, field, sourcePath);
  if (text.startsWith("/") || /^https?:\/\//i.test(text)) {
    return text;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be an absolute path or http/https URL.`);
}

function normalizeProductApiExpectedStatuses(value: unknown, field: string, sourcePath: string): number[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be a non-empty array of HTTP status codes.`);
  }

  return value.map((status, index) => {
    if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
      return status;
    }

    throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field}[${index}] must be an HTTP status code.`);
  });
}
