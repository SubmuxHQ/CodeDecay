export type ProductFailureArtifactKind =
  | "screenshot"
  | "trace"
  | "video"
  | "dom-snapshot"
  | "console-log"
  | "network-log"
  | "test-source"
  | "request-response-diff"
  | "other";

export interface ProductFailureArtifact {
  kind: ProductFailureArtifactKind;
  path?: string | undefined;
  label?: string | undefined;
  description?: string | undefined;
}
