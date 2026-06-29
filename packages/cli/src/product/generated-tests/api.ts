import type { CodeDecayProductApiEndpoint } from "@submuxhq/codedecay-config";
import {
  PRODUCT_API_METHODS,
  SAFE_PRODUCT_API_METHODS,
  type OpenApiDocument,
  type OpenApiOperation,
  type OpenApiPathItem,
  type ProductHttpMethod
} from "./openapi";
import { openApiExpectedStatuses, sampleOpenApiOperationPath, sampleOpenApiRequestBody } from "./api/openapi-samples";
import { priorityForPath, priorityRank } from "./priority";
import { generatedTestId } from "./strings";
import type { ProductGeneratedTestCase } from "../../types";

export { renderGeneratedProductApiTestSource } from "./api/source";

export function createGeneratedProductApiTestCases(
  document: OpenApiDocument,
  baseUrl: string,
  impactedPaths: Set<string>
): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const seen = new Set<string>();
  const paths = document.paths ?? {};

  for (const path of Object.keys(paths).sort((left, right) => left.localeCompare(right))) {
    const pathItem = paths[path];
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    for (const method of PRODUCT_API_METHODS) {
      const operation = pathItem[method.toLowerCase() as Lowercase<ProductHttpMethod>];
      if (!operation || typeof operation !== "object") {
        continue;
      }

      const operationPath = sampleOpenApiOperationPath(path, pathItem, operation);
      const expectedStatuses = openApiExpectedStatuses(operation);
      const destructive = !SAFE_PRODUCT_API_METHODS.has(method);
      const id = generatedTestId("api", method, path, operation.operationId ?? "");
      addGeneratedTestCase(tests, seen, {
        id,
        title: `${method} ${path} returns a documented status`,
        kind: "api-operation",
        pageUrl: new URL(operationPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString(),
        method,
        operationPath,
        operationId: operation.operationId,
        expectedStatuses,
        requestBody: destructive ? sampleOpenApiRequestBody(operation) : undefined,
        destructive,
        priority: priorityForPath(path, impactedPaths)
      });
    }
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

export function createConfiguredProductApiTestCases(
  endpoints: CodeDecayProductApiEndpoint[],
  baseUrl: string,
  impactedPaths: Set<string>
): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const seen = new Set<string>();

  for (const endpoint of endpoints) {
    const destructive = !SAFE_PRODUCT_API_METHODS.has(endpoint.method);
    const id = endpoint.id ?? generatedTestId("api", "configured", endpoint.method, endpoint.path);
    addGeneratedTestCase(tests, seen, {
      id,
      title: `${endpoint.method} ${endpoint.path} returns a configured status`,
      kind: "api-operation",
      pageUrl: new URL(endpoint.path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString(),
      method: endpoint.method,
      operationPath: endpoint.path,
      expectedStatuses: endpoint.expectedStatuses,
      headers: endpoint.headers,
      requestBody: endpoint.body,
      destructive,
      priority: priorityForPath(endpoint.path, impactedPaths)
    });
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function addGeneratedTestCase(tests: ProductGeneratedTestCase[], seen: Set<string>, test: ProductGeneratedTestCase): void {
  if (seen.has(test.id)) {
    return;
  }

  seen.add(test.id);
  tests.push(test);
}
