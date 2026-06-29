export function appendList(lines: string[], items: string[]): void {
  if (items.length === 0) {
    lines.push("- none");
    return;
  }

  for (const item of items) {
    lines.push(`- ${item}`);
  }
}
