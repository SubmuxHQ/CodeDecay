import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";

export function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    writeTextFile(root, relativePath, contents);
  }
}

export function writeTextFile(root, relativePath, contents) {
  const fullPath = join(root, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

export function resetDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

export function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readTextIfExists(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function parseJson(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function firstLines(value, count) {
  return value.split(/\r?\n/).slice(0, count).join("\n");
}

export function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

export function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
