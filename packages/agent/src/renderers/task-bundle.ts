import type { AgentTaskBundle, AgentTaskBundleFormat } from "../types";
import { renderAgentTaskBundleMarkdown } from "./task-bundle/markdown";

export { renderAgentTaskBundleMarkdown } from "./task-bundle/markdown";

export function renderAgentTaskBundle(bundle: AgentTaskBundle, format: AgentTaskBundleFormat): string {
  if (format === "json") {
    return `${JSON.stringify(bundle, null, 2)}\n`;
  }

  return renderAgentTaskBundleMarkdown(bundle);
}
