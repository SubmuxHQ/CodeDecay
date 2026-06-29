import type { CommandDoc } from "../renderers/discovery";
import { ANALYSIS_COMMAND_DOCS } from "./command-docs/analysis";
import { ORCHESTRATION_COMMAND_DOCS } from "./command-docs/orchestration";
import { PRODUCT_COMMAND_DOCS } from "./command-docs/product";
import { STATE_COMMAND_DOCS } from "./command-docs/state";
import { UTILITY_COMMAND_DOCS } from "./command-docs/utility";

export { COMMAND_ORDER, ROOT_FLAG_ALIASES, UTILITY_COMMAND_ORDER } from "./command-docs/order";

export const HELP_DOCS: Record<string, CommandDoc> = {
  ...ANALYSIS_COMMAND_DOCS,
  ...ORCHESTRATION_COMMAND_DOCS,
  ...STATE_COMMAND_DOCS,
  ...PRODUCT_COMMAND_DOCS,
  ...UTILITY_COMMAND_DOCS
};
