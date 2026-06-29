export function extractTitle(content: string): string | undefined {
  const titleLine = content.split(/\r?\n/).find((line) => /^#\s+\S/.test(line));
  return titleLine?.replace(/^#\s+/, "").trim();
}

export function extractSummary(content: string): string {
  const lines = content.split(/\r?\n/);
  const summaryLines: string[] = [];
  let passedTitle = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!passedTitle && /^#\s+\S/.test(trimmed)) {
      passedTitle = true;
      continue;
    }

    if (!passedTitle || trimmed.length === 0) {
      if (summaryLines.length > 0) {
        break;
      }
      continue;
    }

    if (trimmed.startsWith("#")) {
      break;
    }

    summaryLines.push(trimmed);
  }

  return summaryLines.join(" ").trim() || "No summary provided.";
}

export function titleFromId(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
