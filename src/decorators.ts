import type { DecoratorContext, Model, Program } from "@typespec/compiler";
import { $resource } from "@typespec/rest";
import { $lib } from "./lib.js";

export interface AepResourceMetadata {
  type: string;
  singular: string;
  plural: string;
}

const aepResourceKey = $lib.stateKeys.aepResource;

/**
 * Implementation of the @aepResource decorator.
 *
 * Sets up the model as a REST resource (via @resource) and stores
 * AEP-specific metadata for later use in $onValidate.
 */
export function $aepResource(
  context: DecoratorContext,
  entity: Model,
  type: string,
  singular: string,
  plural: string,
) {
  const metadata: AepResourceMetadata = { type, singular, plural };

  // Store metadata in program state for later retrieval
  context.program.stateMap(aepResourceKey).set(entity, metadata);

  // Register as a REST resource with the plural name as the collection segment
  context.call($resource, entity, plural);
}

/**
 * Get the AEP resource metadata for a model.
 */
export function getAepResourceMetadata(
  program: Program,
  entity: Model,
): AepResourceMetadata | undefined {
  return program.stateMap(aepResourceKey).get(entity) as
    | AepResourceMetadata
    | undefined;
}

/**
 * Check if a model is an AEP resource.
 */
export function isAepResource(program: Program, entity: Model): boolean {
  return program.stateMap(aepResourceKey).has(entity);
}
