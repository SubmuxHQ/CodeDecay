export type ProductHttpMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface OpenApiDocument {
  openapi?: string | undefined;
  swagger?: string | undefined;
  servers?: Array<{ url?: string | undefined }> | undefined;
  paths?: Record<string, OpenApiPathItem | undefined> | undefined;
}

export interface OpenApiPathItem {
  parameters?: OpenApiParameter[] | undefined;
  get?: OpenApiOperation | undefined;
  head?: OpenApiOperation | undefined;
  options?: OpenApiOperation | undefined;
  post?: OpenApiOperation | undefined;
  put?: OpenApiOperation | undefined;
  patch?: OpenApiOperation | undefined;
  delete?: OpenApiOperation | undefined;
}

export interface OpenApiOperation {
  operationId?: string | undefined;
  summary?: string | undefined;
  description?: string | undefined;
  parameters?: OpenApiParameter[] | undefined;
  requestBody?: OpenApiRequestBody | undefined;
  responses?: Record<string, unknown> | undefined;
}

export interface OpenApiParameter {
  name?: string | undefined;
  in?: string | undefined;
  required?: boolean | undefined;
  schema?: OpenApiSchema | undefined;
  example?: unknown;
}

export interface OpenApiRequestBody {
  content?: Record<string, { schema?: OpenApiSchema | undefined; example?: unknown } | undefined> | undefined;
  required?: boolean | undefined;
}

export interface OpenApiSchema {
  type?: string | undefined;
  format?: string | undefined;
  enum?: unknown[] | undefined;
  default?: unknown;
  example?: unknown;
  properties?: Record<string, OpenApiSchema | undefined> | undefined;
  required?: string[] | undefined;
  items?: OpenApiSchema | undefined;
}

export interface ResolvedOpenApiSchema {
  schemaPath: string;
  absolutePath: string;
  source: "configured" | "discovered";
}

export const PRODUCT_API_METHODS: ProductHttpMethod[] = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];
export const SAFE_PRODUCT_API_METHODS = new Set<ProductHttpMethod>(["GET", "HEAD", "OPTIONS"]);
