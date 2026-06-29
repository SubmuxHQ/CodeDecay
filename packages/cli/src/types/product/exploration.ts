import type { ProductTargetStatus } from "./status";

export interface ProductExplorerOptions {
  maxPages: number;
  maxActions: number;
  allowDestructiveActions: boolean;
}

export interface ProductExplorationResult {
  status: ProductTargetStatus;
  driver: "playwright";
  artifactPath?: string | undefined;
  pages: number;
  interactiveElements: number;
  blockedActions: number;
  skippedActions: number;
  durationMs: number;
  error?: string | undefined;
  notes: string[];
}

export interface ProductFlowMap {
  schemaVersion: 1;
  generatedAt: string;
  target: {
    id: string;
    baseUrl: string;
    origin: string;
  };
  driver: "playwright";
  limits: {
    sameOrigin: true;
    maxPages: number;
    maxActions: number;
    allowDestructiveActions: boolean;
  };
  summary: {
    pages: number;
    interactiveElements: number;
    blockedActions: number;
    skippedActions: number;
  };
  pages: ProductFlowPage[];
  blockedActions: ProductBlockedAction[];
}

export interface ProductFlowPage {
  url: string;
  title: string;
  path: string;
  depth: number;
  links: ProductFlowLink[];
  interactiveElements: ProductInteractiveElement[];
  screenshotPath?: string | undefined;
}

export interface ProductFlowLink {
  href: string;
  text: string;
  selector: string;
  sameOrigin: boolean;
  discovered: boolean;
}

export interface ProductInteractiveElement {
  kind: "link" | "form" | "button" | "input";
  selector: string;
  name: string;
  action?: string | undefined;
  method?: string | undefined;
  inputType?: string | undefined;
  destructive: boolean;
  blocked: boolean;
  blockReason?: string | undefined;
}

export interface ProductBlockedAction {
  pageUrl: string;
  selector: string;
  name: string;
  reason: string;
}
