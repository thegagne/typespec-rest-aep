import type {
  Model,
  ModelProperty,
  Namespace,
  Operation,
  Program,
  Type,
  Value,
  ObjectValue,
  ArrayValue,
  ObjectValuePropertyDescriptor,
} from "@typespec/compiler";
import { $doc, $summary, $tag, getDoc, getExamples, getSummary, isKey, listServices, navigateTypesInNamespace } from "@typespec/compiler";
import { $ } from "@typespec/compiler/typekit";
import {
  getResourceOperation,
  getParentResource,
  getActionDetails,
  getCollectionActionDetails,
} from "@typespec/rest";
import { $operationId, setExtension } from "@typespec/openapi";
import { getAepResourceMetadata, getAepCollectionFilterDoc, type AepResourceMetadata } from "./decorators.js";

// Access the compiler's internal opExamples state using the global symbol registry.
// The compiler uses Symbol.for("TypeSpec.opExamples") as the key.
const opExamplesKey = Symbol.for("TypeSpec.opExamples");
const examplesKey = Symbol.for("TypeSpec.examples");

// Access @typespec/openapi's tagsMetadata state to set root-level tag descriptions.
const tagsMetadataKey = Symbol.for("@typespec/openapi/tagsMetadata");

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Value construction helpers
// ---------------------------------------------------------------------------

function makeStringValue(program: Program, s: string): Value {
  return $(program).value.createString(s);
}

function makeInt32Value(program: Program, n: number): Value {
  return $(program).value.createNumeric(n);
}

function makeBooleanValue(program: Program, b: boolean): Value {
  return $(program).value.createBoolean(b);
}

function makeObjectValue(
  program: Program,
  props: Map<string, Value>,
): ObjectValue {
  const properties = new Map<string, ObjectValuePropertyDescriptor>();
  for (const [name, value] of props) {
    properties.set(name, { name, value });
  }
  return {
    entityKind: "Value",
    valueKind: "ObjectValue",
    properties,
    type: $(program).intrinsic.any,
  } as ObjectValue;
}

function makeArrayValue(
  program: Program,
  items: Value[],
): ArrayValue {
  return {
    entityKind: "Value",
    valueKind: "ArrayValue",
    values: items,
    type: $(program).intrinsic.any,
  } as ArrayValue;
}

// ---------------------------------------------------------------------------
// Example value generation from model properties
// ---------------------------------------------------------------------------

function getScalarName(type: Type): string | undefined {
  if (type.kind === "Scalar") return type.name;
  return undefined;
}

function generateExampleValue(
  program: Program,
  prop: ModelProperty,
): Value | undefined {
  const scalarName = getScalarName(prop.type);
  if (!scalarName) return undefined;

  switch (scalarName) {
    case "string":
      return makeStringValue(program, `Example ${capitalize(prop.name)}`);
    case "int32":
    case "int64":
      return makeInt32Value(program, 100);
    case "float32":
    case "float64":
      return makeInt32Value(program, 99.99);
    case "boolean":
      return makeBooleanValue(program, true);
    case "utcDateTime":
      return makeStringValue(program, "2024-01-15T10:30:00Z");
    default:
      return undefined;
  }
}

/**
 * Build an example ObjectValue from a resource model's properties.
 * Generates appropriate example values for each property based on its type.
 */
function buildResourceExample(
  program: Program,
  model: Model,
  metadata: AepResourceMetadata,
  options?: { includeKey?: boolean },
): ObjectValue {
  const includeKey = options?.includeKey ?? true;
  const props = new Map<string, Value>();

  for (const [name, prop] of model.properties) {
    // Skip both key (id) and path in update bodies
    if (!includeKey && (isKey(program, prop) || prop.name === "path")) continue;

    // Check for user-provided @example first
    const examples = getExamples(program, prop);
    if (examples.length > 0) {
      props.set(name, examples[0].value);
      continue;
    }

    // For the key property (id), include it in response examples with a generated value
    if (isKey(program, prop)) {
      props.set(name, makeStringValue(program, `my-${metadata.singular}`));
      continue;
    }

    // For the path property, generate a pattern-based full resource name example
    if (prop.name === "path") {
      const pattern = buildPattern(program, model, metadata);
      const examplePath = pattern.replace(
        /\{([^}]+)\}/g,
        (_match, paramName) => `my-${paramName}`,
      );
      props.set(name, makeStringValue(program, examplePath));
      continue;
    }

    const value = generateExampleValue(program, prop);
    if (value) {
      props.set(name, value);
    }
  }

  return makeObjectValue(program, props);
}

/**
 * Collect path parameter examples by walking up the parent resource chain.
 * Returns a map like { publisher: "my-publisher", book: "my-book" }.
 */
function collectPathParams(
  program: Program,
  model: Model,
  metadata: AepResourceMetadata,
): Map<string, Value> {
  const params = new Map<string, Value>();

  // Walk up the parent chain
  const parent = getParentResource(program, model);
  if (parent) {
    const parentMeta = getAepResourceMetadata(program, parent);
    if (parentMeta) {
      const parentParams = collectPathParams(program, parent, parentMeta);
      for (const [k, v] of parentParams) {
        params.set(k, v);
      }
    }
  }

  // Add this resource's key param
  params.set(
    metadata.singular,
    makeStringValue(program, `my-${metadata.singular}`),
  );

  return params;
}

// ---------------------------------------------------------------------------
// Per-operation example builders
// ---------------------------------------------------------------------------

function buildGetExample(
  program: Program,
  model: Model,
  metadata: AepResourceMetadata,
): ObjectValue {
  const pathParams = collectPathParams(program, model, metadata);
  const resourceExample = buildResourceExample(program, model, metadata);
  return makeObjectValue(program, new Map<string, Value>([
    ["parameters", makeObjectValue(program, pathParams)],
    ["returnType", resourceExample],
  ]));
}

function buildListExample(
  program: Program,
  model: Model,
  metadata: AepResourceMetadata,
): ObjectValue {
  // For list, parameters are parent params only (no key for this resource)
  const parentParams = new Map<string, Value>();
  const parent = getParentResource(program, model);
  if (parent) {
    const parentMeta = getAepResourceMetadata(program, parent);
    if (parentMeta) {
      const pp = collectPathParams(program, parent, parentMeta);
      for (const [k, v] of pp) {
        parentParams.set(k, v);
      }
    }
  }

  const resourceExample = buildResourceExample(program, model, metadata);
  const listResponse = makeObjectValue(program, new Map<string, Value>([
    ["results", makeArrayValue(program, [resourceExample])],
    ["next_page_token", makeStringValue(program, "")],
  ]));

  return makeObjectValue(program, new Map<string, Value>([
    ["parameters", makeObjectValue(program, parentParams)],
    ["returnType", listResponse],
  ]));
}

function buildCreateExample(
  program: Program,
  model: Model,
  metadata: AepResourceMetadata,
): ObjectValue {
  // Parameters: parent path params + { resource: {...all fields} }
  const params = new Map<string, Value>();
  const parent = getParentResource(program, model);
  if (parent) {
    const parentMeta = getAepResourceMetadata(program, parent);
    if (parentMeta) {
      const pp = collectPathParams(program, parent, parentMeta);
      for (const [k, v] of pp) {
        params.set(k, v);
      }
    }
  }
  const bodyExample = buildResourceExample(program, model, metadata);
  params.set("resource", bodyExample);

  const responseExample = buildResourceExample(program, model, metadata);
  return makeObjectValue(program, new Map<string, Value>([
    ["parameters", makeObjectValue(program, params)],
    ["returnType", responseExample],
  ]));
}

function buildUpdateExample(
  program: Program,
  model: Model,
  metadata: AepResourceMetadata,
): ObjectValue {
  // Parameters: path params + contentType + { resource: {...without path} }
  const pathParams = collectPathParams(program, model, metadata);
  pathParams.set("contentType", makeStringValue(program, "application/merge-patch+json"));
  const bodyExample = buildResourceExample(program, model, metadata, { includeKey: false });
  pathParams.set("resource", bodyExample);

  const responseExample = buildResourceExample(program, model, metadata);
  return makeObjectValue(program, new Map<string, Value>([
    ["parameters", makeObjectValue(program, pathParams)],
    ["returnType", responseExample],
  ]));
}

function buildDeleteExample(
  program: Program,
  model: Model,
  metadata: AepResourceMetadata,
): ObjectValue {
  const pathParams = collectPathParams(program, model, metadata);
  // Delete returns 204 with no body, so no returnType
  return makeObjectValue(program, new Map<string, Value>([
    ["parameters", makeObjectValue(program, pathParams)],
  ]));
}

function buildApplyExample(
  program: Program,
  model: Model,
  metadata: AepResourceMetadata,
): ObjectValue {
  // Parameters: path params + { resource: {...all fields} }
  const pathParams = collectPathParams(program, model, metadata);
  const bodyExample = buildResourceExample(program, model, metadata);
  pathParams.set("resource", bodyExample);

  const responseExample = buildResourceExample(program, model, metadata);
  return makeObjectValue(program, new Map<string, Value>([
    ["parameters", makeObjectValue(program, pathParams)],
    ["returnType", responseExample],
  ]));
}

function buildOperationExample(
  program: Program,
  opType: string,
  model: Model,
  metadata: AepResourceMetadata,
): ObjectValue | undefined {
  switch (opType) {
    case "read":
      return buildGetExample(program, model, metadata);
    case "list":
      return buildListExample(program, model, metadata);
    case "create":
      return buildCreateExample(program, model, metadata);
    case "update":
      return buildUpdateExample(program, model, metadata);
    case "delete":
      return buildDeleteExample(program, model, metadata);
    case "createOrReplace":
      return buildApplyExample(program, model, metadata);
    default:
      return undefined;
  }
}

/**
 * Store an operation example directly in the compiler's opExamples state map.
 */
function setOpExample(
  program: Program,
  op: Operation,
  exampleConfig: ObjectValue,
): void {
  const parameters = exampleConfig.properties.get("parameters")?.value;
  const returnType = exampleConfig.properties.get("returnType")?.value;

  const stateMap = program.stateMap(opExamplesKey);
  let list = stateMap.get(op) as { parameters?: Value; returnType?: Value }[] | undefined;
  if (list === undefined) {
    list = [];
    stateMap.set(op, list);
  }
  list.push({ parameters, returnType });
}

/**
 * Set an @example value on a model property by writing directly to the compiler's examples state.
 */
function setPropertyExample(program: Program, prop: ModelProperty, value: Value): void {
  const stateMap = program.stateMap(examplesKey);
  let examples = stateMap.get(prop) as { value: Value; title?: string }[] | undefined;
  if (!examples) {
    examples = [];
    stateMap.set(prop, examples);
  }
  examples.push({ value });
}

/**
 * Set an example on the `results` property of a list operation's response model.
 */
function setListResultsExample(
  program: Program,
  op: Operation,
  model: Model,
  metadata: AepResourceMetadata,
): void {
  const returnType = op.returnType;
  if (returnType.kind !== "Union") return;

  for (const variant of returnType.variants.values()) {
    if (variant.type.kind !== "Model") continue;
    const resultsProp = variant.type.properties.get("results");
    if (!resultsProp) continue;

    // Only set if not already set
    const existing = program.stateMap(examplesKey).get(resultsProp);
    if (existing) break;

    const exampleItem = buildResourceExample(program, model, metadata);
    const exampleArray = makeArrayValue(program, [exampleItem]);
    setPropertyExample(program, resultsProp, exampleArray);

    const nextPageTokenProp = variant.type.properties.get("next_page_token");
    if (nextPageTokenProp) {
      setPropertyExample(program, nextPageTokenProp, makeStringValue(program, ""));
    }
    break;
  }
}

const errorStatusCodes = [
  { code: 400, title: "Bad Request", detail: "The request was invalid." },
  { code: 401, title: "Unauthorized", detail: "Authentication is required." },
  { code: 403, title: "Forbidden", detail: "Permission denied." },
  { code: 404, title: "Not Found", detail: "The resource was not found." },
  { code: 409, title: "Conflict", detail: "The resource already exists." },
  { code: 500, title: "Internal Server Error", detail: "An internal error occurred." },
];

/**
 * Push error response examples for each ProblemDetails status code.
 * The emitter matches each example to the correct response via the `_` (statusCode) property.
 */
function setErrorExamples(program: Program, op: Operation): void {
  const stateMap = program.stateMap(opExamplesKey);
  let list = stateMap.get(op) as { parameters?: Value; returnType?: Value }[] | undefined;
  if (list === undefined) {
    list = [];
    stateMap.set(op, list);
  }
  for (const err of errorStatusCodes) {
    const props = new Map<string, Value>();
    props.set("_", makeInt32Value(program, err.code));
    props.set(
      "type",
      makeStringValue(
        program,
        `https://example.com/errors/${err.title.toLowerCase().replace(/ /g, "-")}`,
      ),
    );
    props.set("title", makeStringValue(program, err.title));
    props.set("status", makeInt32Value(program, err.code));
    props.set("detail", makeStringValue(program, err.detail));
    list.push({ returnType: makeObjectValue(program, props) });
  }
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
  createOrReplace: "Apply",
};

function getOperationSummary(
  opType: string,
  metadata: AepResourceMetadata,
): string {
  const singular = capitalize(metadata.singular);
  const plural = capitalize(metadata.plural);
  switch (opType) {
    case "read":
      return `Get ${singular}`;
    case "list":
      return `List ${plural}`;
    case "create":
      return `Create ${singular}`;
    case "update":
      return `Update ${singular}`;
    case "delete":
      return `Delete ${singular}`;
    case "createOrReplace":
      return `Apply ${singular}`;
    default:
      return "";
  }
}

function getOperationDescription(
  opType: string,
  metadata: AepResourceMetadata,
): string {
  const singular = metadata.singular;
  const plural = metadata.plural;
  switch (opType) {
    case "read":
      return `Gets a single ${singular} by its resource name.`;
    case "list":
      return `Lists ${plural} with support for filtering, pagination, and sorting.`;
    case "create":
      return `Creates a new ${singular}. An optional \`id\` query parameter can be provided to set the resource identifier.`;
    case "update":
      return `Updates an existing ${singular} using merge-patch semantics. Only fields included in the request body are modified.`;
    case "delete":
      return `Deletes a ${singular}.`;
    case "createOrReplace":
      return `Creates or replaces a ${singular}. If the ${singular} already exists, it is fully replaced.`;
    default:
      return "";
  }
}

function getOperationIdSuffix(
  opType: string,
  metadata: AepResourceMetadata,
): string {
  if (opType === "list") {
    return capitalize(metadata.plural);
  }
  return capitalize(metadata.singular);
}

/**
 * Find the AEP resource model associated with an operation by looking at
 * sibling operations in the same interface that have resource operation metadata.
 */
function findResourceForOperation(
  program: Program,
  op: Operation,
): { model: Model; metadata: AepResourceMetadata } | undefined {
  const iface = op.interface;
  if (!iface) return undefined;

  for (const sibling of iface.operations.values()) {
    const resOp = getResourceOperation(program, sibling);
    if (resOp) {
      const metadata = getAepResourceMetadata(program, resOp.resourceType);
      if (metadata) {
        return { model: resOp.resourceType, metadata };
      }
    }
  }
  return undefined;
}

function getTagName(metadata: AepResourceMetadata): string {
  return capitalize(metadata.plural);
}

function setAepOperationId(program: Program, op: Operation): void {
  const fakeContext = { program } as any;

  // First check standard resource operations (existing logic)
  const resOp = getResourceOperation(program, op);
  if (resOp) {
    const metadata = getAepResourceMetadata(program, resOp.resourceType);
    if (!metadata) return;

    const prefix = operationPrefixMap[resOp.operation];
    if (!prefix) return;

    const suffix = getOperationIdSuffix(resOp.operation, metadata);
    const operationId = `${prefix}${suffix}`;

    $operationId(fakeContext, op, operationId);
    $tag(fakeContext, op, getTagName(metadata));

    const summary = getOperationSummary(resOp.operation, metadata);
    if (summary) {
      $summary(fakeContext, op, summary);
    }
    const doc = getOperationDescription(resOp.operation, metadata);
    if (doc) {
      $doc(fakeContext, op, doc);
    }

    // Attach operation example
    const example = buildOperationExample(program, resOp.operation, resOp.resourceType, metadata);
    if (example) {
      setOpExample(program, op, example);
    }
    setErrorExamples(program, op);

    // Set example on list response `results` property for schema-level docs
    if (resOp.operation === "list") {
      setListResultsExample(program, op, resOp.resourceType, metadata);

      // Apply custom filter parameter description if provided via @aepCollectionFilterDoc
      const customFilterDoc = getAepCollectionFilterDoc(program, resOp.resourceType);
      if (customFilterDoc) {
        const filterParam = op.parameters.properties.get("filter");
        if (filterParam) {
          $doc(fakeContext, filterParam, customFilterDoc);
        }
      }
    }
    return;
  }

  // Then check for custom actions (AEP-136)
  // AEP-136 requires operation IDs to start with ":" e.g., ":ArchiveBook"
  const actionDetails = getActionDetails(program, op);
  if (actionDetails) {
    const resource = findResourceForOperation(program, op);
    if (resource) {
      const operationId = `:${capitalize(actionDetails.name)}${capitalize(resource.metadata.singular)}`;
      $operationId(fakeContext, op, operationId);
      $tag(fakeContext, op, getTagName(resource.metadata));
      if (!getSummary(program, op)) {
        $summary(fakeContext, op, `${capitalize(actionDetails.name)} ${capitalize(resource.metadata.singular)}`);
      }
      const example = buildGetExample(program, resource.model, resource.metadata);
      setOpExample(program, op, example);
    }
    setErrorExamples(program, op);
    return;
  }

  const collectionAction = getCollectionActionDetails(program, op);
  if (collectionAction) {
    const resource = findResourceForOperation(program, op);
    if (resource) {
      const operationId = `:${capitalize(collectionAction.name)}${capitalize(resource.metadata.plural)}`;
      $operationId(fakeContext, op, operationId);
      $tag(fakeContext, op, getTagName(resource.metadata));
      if (!getSummary(program, op)) {
        $summary(fakeContext, op, `${capitalize(collectionAction.name)} ${capitalize(resource.metadata.plural)}`);
      }
      const example = buildGetExample(program, resource.model, resource.metadata);
      setOpExample(program, op, example);
    }
    setErrorExamples(program, op);
  }
}

/**
 * Register a root-level OpenAPI tag with description on the service namespace.
 */
function ensureTagMetadata(
  program: Program,
  serviceNamespace: Namespace,
  metadata: AepResourceMetadata,
): void {
  const tagName = getTagName(metadata);
  const stateMap = program.stateMap(tagsMetadataKey);
  let tags = stateMap.get(serviceNamespace) as Record<string, { description?: string }> | undefined;
  if (!tags) {
    tags = {};
    stateMap.set(serviceNamespace, tags);
  }
  if (!tags[tagName]) {
    tags[tagName] = { description: `Operations for managing ${metadata.plural}.` };
  }
}

/**
 * Called after all decorators are applied. Sets:
 * 1. x-aep-resource extension on all AEP resource models (with correct patterns)
 * 2. Operation IDs and tags on all AEP resource operations
 * 3. Root-level tag metadata on the service namespace
 */
export function $onValidate(program: Program): void {
  for (const service of listServices(program)) {
    // Set x-aep-resource extensions and tag metadata on models
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

        // Auto-generate a model description if none is provided
        if (!getDoc(program, model)) {
          $doc({ program } as any, model, `A ${metadata.singular} resource.`);
        }

        ensureTagMetadata(program, service.type, metadata);
      },
    });

    // Sort tags alphabetically
    const stateMap = program.stateMap(tagsMetadataKey);
    const tags = stateMap.get(service.type) as Record<string, { description?: string }> | undefined;
    if (tags) {
      const sorted: Record<string, { description?: string }> = {};
      for (const key of Object.keys(tags).sort()) {
        sorted[key] = tags[key];
      }
      stateMap.set(service.type, sorted);
    }

    // Set operation IDs and tags by manually iterating interfaces and their operations
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
