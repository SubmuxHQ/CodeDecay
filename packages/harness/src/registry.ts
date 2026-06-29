import type { CodeDecayHarness, HarnessCapability } from "./types";

export class HarnessRegistry {
  private readonly harnesses = new Map<string, CodeDecayHarness>();

  constructor(harnesses: CodeDecayHarness[] = []) {
    for (const harness of harnesses) {
      this.register(harness);
    }
  }

  register(harness: CodeDecayHarness): void {
    validateHarness(harness);

    if (this.harnesses.has(harness.name)) {
      throw new Error(`Harness already registered: ${harness.name}`);
    }

    this.harnesses.set(harness.name, harness);
  }

  unregister(name: string): boolean {
    validateNonEmptyString(name, "Harness name");
    return this.harnesses.delete(name);
  }

  get(name: string): CodeDecayHarness | undefined {
    validateNonEmptyString(name, "Harness name");
    return this.harnesses.get(name);
  }

  require(name: string): CodeDecayHarness {
    const harness = this.get(name);
    if (!harness) {
      throw new Error(`Harness not found: ${name}`);
    }

    return harness;
  }

  list(): CodeDecayHarness[] {
    return [...this.harnesses.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  findByCapability(capability: HarnessCapability): CodeDecayHarness[] {
    return this.list().filter((harness) => harness.capabilities.includes(capability));
  }
}

export function createHarnessRegistry(harnesses: CodeDecayHarness[] = []): HarnessRegistry {
  return new HarnessRegistry(harnesses);
}

function validateHarness(harness: CodeDecayHarness): void {
  validateNonEmptyString(harness.name, "Harness name");

  if (!Array.isArray(harness.capabilities) || harness.capabilities.length === 0) {
    throw new Error(`Harness ${harness.name} must declare at least one capability.`);
  }

  const duplicateCapabilities = findDuplicates(harness.capabilities);
  if (duplicateCapabilities.length > 0) {
    throw new Error(`Harness ${harness.name} has duplicate capabilities: ${duplicateCapabilities.join(", ")}`);
  }

  if (!Array.isArray(harness.requiredConfig)) {
    throw new Error(`Harness ${harness.name} requiredConfig must be an array.`);
  }
}

function validateNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates].sort((left, right) => left.localeCompare(right));
}
