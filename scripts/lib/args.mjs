export function createRunId(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

export function readOptionValue(args, index, flag, message = "Expected value after") {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${message} ${flag}`);
  }

  return value;
}

export function splitCommand(value) {
  return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^["']|["']$/g, "")) ?? [];
}
