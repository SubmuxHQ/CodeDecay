import { dedupeStrings } from "@submuxhq/codedecay-core";
import { HTTP_METHODS, type HttpMethod } from "../shared";
import { findObjectPropertyValue, isQuote, readQuotedValue } from "./scanner";

export function extractRouteObjectMethods(body: string): string[] {
  const methodValue = findObjectPropertyValue(body, "method");
  if (!methodValue) {
    return ["*"];
  }

  if (methodValue.kind === "array") {
    const methods = extractQuotedHttpMethods(methodValue.value);
    return methods.length > 0 ? methods : ["*"];
  }

  const method = methodValue.value.toUpperCase();
  if (HTTP_METHODS.includes(method as HttpMethod)) {
    return [method];
  }

  return ["*"];
}

function extractQuotedHttpMethods(value: string): string[] {
  const methods: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    if (!isQuote(value[cursor])) {
      cursor += 1;
      continue;
    }

    const quoted = readQuotedValue(value, cursor);
    if (!quoted) {
      cursor += 1;
      continue;
    }

    const method = quoted.value.toUpperCase();
    if (HTTP_METHODS.includes(method as HttpMethod)) {
      methods.push(method);
    }

    cursor = quoted.endIndex + 1;
  }

  return dedupeStrings(methods);
}
