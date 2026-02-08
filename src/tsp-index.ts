import { $aepResource } from "./decorators.js";

export { $lib } from "./lib.js";
export { $onValidate } from "./validate.js";

/** @internal */
export const $decorators = {
  Aep: {
    aepResource: $aepResource,
  },
};
