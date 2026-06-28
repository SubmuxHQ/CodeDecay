export interface ProductGeneratedTestDependencies {
  findPrioritizedProductPaths: (rootDir: string) => Set<string>;
  findImpactedProductFiles: (rootDir: string) => string[];
}
