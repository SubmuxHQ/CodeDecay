export async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
