import { dedupeStrings } from "@submuxhq/codedecay-core";
import { normalizeProductPath } from "../schema";
import { asRecord, stringValue } from "./records";

export function productPathsFromTest(test: Record<string, unknown> | undefined): string[] {
  if (!test) {
    return [];
  }

  return dedupeStrings(
    [
      productPathFromUnknown(test.operationPath),
      productPathFromUnknown(test.pageUrl),
      productPathFromUnknown(test.targetUrl)
    ].filter((path): path is string => Boolean(path))
  );
}

export function productPathsFromFailure(failure: Record<string, unknown>): string[] {
  const request = asRecord(failure.request);
  return dedupeStrings([productPathFromUnknown(request?.url)].filter((path): path is string => Boolean(path)));
}

export function productPathFromUnknown(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return normalizeProductPath(url.pathname);
  } catch {
    if (!trimmed.startsWith("/")) {
      return undefined;
    }

    return normalizeProductPath(trimmed.split(/[?#]/, 1)[0] ?? trimmed);
  }
}

export function productRerunCommand(
  targetId: string,
  runFlag: "--run-generated-tests" | "--run-generated-api-tests",
  testId: string | undefined
): string {
  const testIdArg = testId ? ` --test-id ${testId}` : "";
  return `npx codedecay product --target ${targetId} ${runFlag}${testIdArg} --format markdown`;
}

export function targetIdFromProductReportTarget(target: Record<string, unknown>): string {
  return stringValue(target.id) ?? "product";
}
