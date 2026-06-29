import { extractRouteObjectMethods } from "./object-parser/methods";
import { findObjectPropertyValue } from "./object-parser/scanner";

export { extractRouteObjectMethods };

export function findObjectStringProperty(body: string, propertyName: string): string | undefined {
  const value = findObjectPropertyValue(body, propertyName);
  return value?.kind === "string" ? value.value : undefined;
}
