import type { Model, Operation, Program } from "@typespec/compiler";
import { listServices, navigateTypesInNamespace } from "@typespec/compiler";
import { getResourceOperation, getParentResource } from "@typespec/rest";
import { $operationId, setExtension } from "@typespec/openapi";
import { getAepResourceMetadata, type AepResourceMetadata } from "./decorators.js";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build the AEP resource pattern by walking up the parent chain.
 * e.g., "publishers/{publisher}/books/{book}"
 */
function buildPattern(
  program: Program,
  model: Model,
  metadata: AepResourceMetadata,
): string {
  const parent = getParentResource(program, model);
  if (parent) {
    const parentMeta = getAepResourceMetadata(program, parent);
    if (parentMeta) {
      const parentPattern = buildPattern(program, parent, parentMeta);
      return `${parentPattern}/${metadata.plural}/{${metadata.singular}}`;
    }
  }
  return `${metadata.plural}/{${metadata.singular}}`;
}

const operationPrefixMap: Record<string, string> = {
  read: "Get",
  list: "List",
  create: "Create",
  update: "Update",
  delete: "Delete",
};

function getOperationIdSuffix(
  opType: string,
  metadata: AepResourceMetadata,
): string {
  if (opType === "list") {
    return capitalize(metadata.plural);
  }
  return capitalize(metadata.singular);
}

function setAepOperationId(program: Program, op: Operation): void {
  const resOp = getResourceOperation(program, op);
  if (!resOp) return;

  const metadata = getAepResourceMetadata(program, resOp.resourceType);
  if (!metadata) return;

  const prefix = operationPrefixMap[resOp.operation];
  if (!prefix) return;

  const suffix = getOperationIdSuffix(resOp.operation, metadata);
  const operationId = `${prefix}${suffix}`;

  const fakeContext = { program } as any;
  $operationId(fakeContext, op, operationId);
}

/**
 * Called after all decorators are applied. Sets:
 * 1. x-aep-resource extension on all AEP resource models (with correct patterns)
 * 2. Operation IDs on all AEP resource operations
 */
export function $onValidate(program: Program): void {
  for (const service of listServices(program)) {
    // Set x-aep-resource extensions on models
    navigateTypesInNamespace(service.type, {
      model: (model) => {
        const metadata = getAepResourceMetadata(program, model);
        if (!metadata) return;

        const pattern = buildPattern(program, model, metadata);

        setExtension(program, model, "x-aep-resource", {
          singular: metadata.singular,
          plural: metadata.plural,
          type: metadata.type,
          patterns: [pattern],
        });
      },
    });

    // Set operation IDs by manually iterating interfaces and their operations
    for (const iface of service.type.interfaces.values()) {
      for (const op of iface.operations.values()) {
        setAepOperationId(program, op);
      }
    }

    // Also check top-level operations
    for (const op of service.type.operations.values()) {
      setAepOperationId(program, op);
    }
  }
}
