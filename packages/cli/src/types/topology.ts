import type { ConfigFormat } from "./common";

export interface TopologyOptions {
  cwd?: string | undefined;
  format: ConfigFormat;
  output?: string | undefined;
  manifest?: string | undefined;
  openapi: string[];
  asyncapi: string[];
  localGraph?: string | undefined;
  changed: string[];
  invalidate: string[];
  repositoryId?: string | undefined;
  revision?: string | undefined;
  producerServiceId?: string | undefined;
  publisherServiceId?: string | undefined;
  subscriberServiceId?: string | undefined;
}
