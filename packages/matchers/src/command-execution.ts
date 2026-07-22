import { stripComments } from "./utils";

const COMMAND_EXECUTION_FUNCTIONS = ["exec", "execsync", "spawn"];

export function commandExecutionSinkMarkers(content: string): string[] {
  // This is shallow binding discovery for the deterministic fallback matcher.
  // Semgrep remains the configured path for alias and cross-file data-flow analysis.
  const functions = new Set<string>();
  const receivers = new Set<string>();
  const source = stripComments(content);
  const namedBindingPatterns = [
    /^\s*import\s*\{([^}]*)\}\s*from\s*["'](?:(?:node:)?child_process|shelljs)["']/gim,
    /^\s*(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\s*\(\s*["'](?:(?:node:)?child_process|shelljs)["']\s*\)/gim
  ];
  const receiverBindingPatterns = [
    /^\s*import\s+\*\s+as\s+([$A-Z_a-z][$\w]*)\s+from\s+["'](?:(?:node:)?child_process|shelljs)["']/gim,
    /^\s*import\s+([$A-Z_a-z][$\w]*)\s+from\s+["'](?:(?:node:)?child_process|shelljs)["']/gim,
    /^\s*(?:const|let|var)\s+([$A-Z_a-z][$\w]*)\s*=\s*require\s*\(\s*["'](?:(?:node:)?child_process|shelljs)["']\s*\)/gim,
    /^\s*import\s+([$A-Z_a-z][$\w]*)\s*=\s*require\s*\(\s*["'](?:(?:node:)?child_process|shelljs)["']\s*\)/gim
  ];

  for (const pattern of namedBindingPatterns) {
    collectNamedBindings(source, pattern, functions);
  }
  for (const pattern of receiverBindingPatterns) {
    collectMatches(source, pattern, receivers);
  }

  return [
    ...[...functions].map((name) => `${name}(`),
    ...[...receivers].flatMap((receiver) =>
      COMMAND_EXECUTION_FUNCTIONS.map((name) => `${receiver.toLowerCase()}.${name}(`)
    )
  ];
}

function collectNamedBindings(source: string, pattern: RegExp, bindings: Set<string>): void {
  for (const match of source.matchAll(pattern)) {
    for (const specifier of (match[1] ?? "").split(",")) {
      const binding = specifier.trim().toLowerCase();
      if (COMMAND_EXECUTION_FUNCTIONS.includes(binding)) {
        bindings.add(binding);
      }
    }
  }
}

function collectMatches(source: string, pattern: RegExp, bindings: Set<string>): void {
  for (const match of source.matchAll(pattern)) {
    if (match[1]) {
      bindings.add(match[1].toLowerCase());
    }
  }
}
