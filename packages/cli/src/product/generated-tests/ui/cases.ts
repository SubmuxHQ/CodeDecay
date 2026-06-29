import type { ProductFlowMap, ProductGeneratedTestCase } from "../../../types";
import { priorityForPath, priorityRank } from "../priority";
import { generatedTestId } from "../strings";

export function createGeneratedProductTestCases(
  flowMap: ProductFlowMap,
  impactedPaths: Set<string>
): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const pages = [...flowMap.pages].sort((left, right) => left.depth - right.depth || left.url.localeCompare(right.url));
  const seen = new Set<string>();

  for (const page of pages) {
    addGeneratedTestCase(tests, seen, {
      id: generatedTestId("route", page.path),
      title: `loads ${page.path || "/"}`,
      kind: "route-load",
      pageUrl: page.url,
      priority: priorityForPath(page.path, impactedPaths)
    });
  }

  for (const page of pages) {
    const links = page.links
      .filter((link) => link.sameOrigin && link.discovered && link.text.trim().length > 0)
      .sort((left, right) => left.href.localeCompare(right.href));

    for (const link of links) {
      addGeneratedTestCase(tests, seen, {
        id: generatedTestId("link", page.path, new URL(link.href).pathname, link.text),
        title: `navigates from ${page.path || "/"} to ${new URL(link.href).pathname || "/"} via ${link.text}`,
        kind: "link-navigation",
        pageUrl: page.url,
        selector: link.selector,
        targetUrl: link.href,
        priority: priorityForPath(new URL(link.href).pathname, impactedPaths)
      });
    }
  }

  for (const page of pages) {
    const inputs = page.interactiveElements
      .filter((element) => element.kind === "input" && !element.blocked && safeInputType(element.inputType))
      .sort((left, right) => left.selector.localeCompare(right.selector));

    for (const input of inputs) {
      addGeneratedTestCase(tests, seen, {
        id: generatedTestId("input", page.path, input.name, input.selector),
        title: `fills ${input.name} on ${page.path || "/"}`,
        kind: "input-state",
        pageUrl: page.url,
        selector: input.selector,
        priority: priorityForPath(page.path, impactedPaths)
      });
    }
  }

  for (const page of pages) {
    const forms = page.interactiveElements
      .filter((element) => element.kind === "form" && !element.blocked)
      .sort((left, right) => left.selector.localeCompare(right.selector));

    for (const form of forms) {
      addGeneratedTestCase(tests, seen, {
        id: generatedTestId("form", page.path, form.name, form.selector),
        title: `shows safe form ${form.name} on ${page.path || "/"}`,
        kind: "form-visibility",
        pageUrl: page.url,
        selector: form.selector,
        priority: priorityForPath(page.path, impactedPaths)
      });
    }
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function addGeneratedTestCase(tests: ProductGeneratedTestCase[], seen: Set<string>, test: ProductGeneratedTestCase): void {
  if (seen.has(test.id)) {
    return;
  }

  seen.add(test.id);
  tests.push(test);
}

function safeInputType(inputType: string | undefined): boolean {
  return ["text", "email", "search", "tel", "url", "password", undefined].includes(inputType);
}
