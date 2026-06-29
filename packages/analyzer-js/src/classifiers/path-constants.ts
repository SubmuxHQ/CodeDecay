export const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py"]);

export const ASSET_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".eot",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".svg",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2"
]);

export const TEST_DIR_NAMES = new Set(["test", "tests", "spec", "specs", "e2e", "integration", "__tests__", "__specs__"]);

export const TEST_FILE_STEM_PATTERN = /(^|[._-])(test|spec|e2e|integration)([._-]|$)/i;

export const PACKAGE_METADATA_KEYS = new Set([
  "author",
  "bugs",
  "description",
  "funding",
  "homepage",
  "keywords",
  "license",
  "name",
  "private",
  "repository",
  "version"
]);
