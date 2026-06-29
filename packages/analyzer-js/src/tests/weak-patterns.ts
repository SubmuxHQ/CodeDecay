export const ASSERTION_PATTERN =
  /\b(expect|assert|strictEqual|deepStrictEqual|ok)\s*\(|\bshould\(|\bto(Be|Equal|StrictEqual|Contain|Match|Have|Throw|BeTruthy|BeFalsy)\b/;

export const SNAPSHOT_ASSERTION_PATTERN = /\b(toMatchSnapshot|toMatchInlineSnapshot|toHaveScreenshot)\s*\(/;

export const MOCK_PATTERN =
  /\b(jest\.mock|vi\.mock|sinon\.stub|sinon\.mock|mockResolvedValue|mockRejectedValue|mockReturnValue|mockImplementation|createMock|mockFn)\b/;

const TEST_CASE_PATTERN = /\b(it|test|specify)\s*\(/;
const EDGE_CASE_PATTERN = /(invalid|missing|null|undefined|empty|error|fail|reject|unauthorized|forbidden|boundary|overflow|malformed)/;

export function looksLikeRunnableTest(content: string): boolean {
  return TEST_CASE_PATTERN.test(content);
}

export function hasNegativeOrEdgeCaseSignal(content: string): boolean {
  return EDGE_CASE_PATTERN.test(content.toLowerCase());
}
