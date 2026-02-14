# Questions for TypeSpec Maintainers

We're building [typespec-rest-aep](https://github.com/thegagne/typespec-rest-aep), a library that generates AEP-compliant OpenAPI from a single `@aepResource` model decorator. The decorator fires on models, and our `$onValidate` hook auto-generates operation IDs, tags, summaries, descriptions, examples, and `x-aep-resource` extensions on the operations produced by template interfaces.

We have several questions about whether our patterns are supported/recommended, and whether better APIs exist.

---

## 1. Calling decorators programmatically from `$onValidate`

We call public decorators (`$operationId`, `$tag`, `$doc`, `$summary`) from `$onValidate` using a fake context:

```typescript
// src/validate.ts:559
const fakeContext = { program } as any;
$operationId(fakeContext, op, operationId);  // line 573
$tag(fakeContext, op, getTagName(metadata)); // line 574
$summary(fakeContext, op, summary);          // line 578
$doc(fakeContext, op, doc);                  // line 582
```

This works because these decorators only use `context.program` internally. But casting to `any` feels wrong.

**Questions:**
- Is there a supported way to call decorators programmatically outside the decorator phase?
- Would you consider exposing setter functions (e.g., `setOperationId(program, op, id)`) alongside the existing getters (`getOperationId`)?
- Is `$onValidate` an appropriate place to set metadata, or should this only happen during the decorator phase?

---

## 2. `$opExample` cannot be called programmatically

Unlike the other decorators, `$opExample` reads its own AST decorator node from `target.decorators`:

```javascript
// @typespec/compiler/dist/src/lib/decorators.js:854-856
export const $opExample = (context, target, _example, options) => {
    const decorator = target.decorators.find(
        (d) => d.decorator === $opExample && d.node === context.decoratorTarget
    );
    compilerAssert(decorator, `Couldn't find @opExample decorator`, context.decoratorTarget);
```

This means calling `$opExample({ program } as any, op, ...)` crashes because there's no matching AST node in `target.decorators`. We work around this by writing directly to the internal state map:

```typescript
// src/validate.ts:26
const opExamplesKey = Symbol.for("TypeSpec.opExamples");

// src/validate.ts:352-358
function setOpExample(program, op, exampleConfig) {
  const stateMap = program.stateMap(opExamplesKey);
  let list = stateMap.get(op);
  // ...
  list.push({ parameters, returnType });
}
```

We do the same for property-level `@example` values:

```typescript
// src/validate.ts:27
const examplesKey = Symbol.for("TypeSpec.examples");

// src/validate.ts:364-372
function setPropertyExample(program, prop, value) {
  const stateMap = program.stateMap(examplesKey);
  // ...
  examples.push({ value });
}
```

**Questions:**
- Is there a supported way to set operation examples programmatically without going through `$opExample`?
- Would you consider exposing `setOpExamples(program, op, examples)` and `setExamples(program, prop, examples)` as public APIs?
- Is writing to state maps via `Symbol.for("TypeSpec.opExamples")` considered stable, or could this symbol change?

---

## 3. `navigateTypesInNamespace` skips template-derived interfaces

When using `navigateTypesInNamespace` with an `operation` listener, operations inside template-derived interfaces are never visited. This is because `navigateInterfaceType` checks `shouldNavigateTemplatableType`, which returns `false` when `isFinished` is false on the interface:

```javascript
// @typespec/compiler/dist/src/core/semantic-walker.js:200-211
function navigateInterfaceType(type, context) {
    // ...
    if (!shouldNavigateTemplatableType(context, type)) {
        return;  // Skips the entire interface and its operations
    }
    // ...
    for (const op of type.operations.values()) {
        navigateOperationType(op, context);
    }
}
```

Our workaround is to manually iterate interfaces and their operations:

```typescript
// src/validate.ts:699-707
for (const iface of service.type.interfaces.values()) {
  for (const op of iface.operations.values()) {
    setAepOperationId(program, op);
  }
}
```

**Questions:**
- Is this the intended behavior? It seems like a library that needs to process all operations in a service would commonly hit this.
- Would an option like `includeTemplateInstantiations: true` on `navigateTypesInNamespace` be feasible?
- Is manually iterating `service.type.interfaces.values()` the recommended workaround?

---

## 4. Architecture: decorator library vs. emitter

Our library applies `@aepResource` to models, but needs to set metadata on operations that come from template interfaces (`AepResourceOperations<T>`). Those operations don't exist yet during the decorator phase, so we use `$onValidate` as the hook point.

The built-in `@typespec/rest` avoids this because its decorators (`@readsResource`, etc.) target operations directly. The `@typespec/openapi3` emitter then reads that state at emit time.

We considered writing a custom emitter that wraps `@typespec/openapi3` (calling `getOpenAPI3()` which is exported), but this would change the user workflow (`--emit typespec-rest-aep` instead of `--emit @typespec/openapi3`).

**Questions:**
- Is there a recommended pattern for libraries that need to derive operation-level metadata from model-level decorators?
- Could a library hook into the `@typespec/openapi3` emitter's pipeline (e.g., a plugin/middleware system) rather than replacing it entirely?
- Is `$onValidate` an acceptable place for this kind of metadata derivation, or is it only intended for diagnostics?

---

## 5. Tag metadata state key

We write root-level OpenAPI tag metadata (descriptions) using:

```typescript
// src/validate.ts:30
const tagsMetadataKey = Symbol.for("@typespec/openapi/tagsMetadata");
```

This matches the symbol created by `createStateKeys` in the compiler:

```javascript
// @typespec/compiler/dist/src/core/library.js:16-22
function createStateKeys(libName, state) {
    const result = {};
    for (const key of Object.keys(state ?? {})) {
        result[key] = Symbol.for(`${libName}/${key}`);
    }
    return result;
}
```

We noted that `@typespec/openapi` exports `getTagsMetadata()` as a public getter but does not export the setter (`setTagsMetadata`) or the state key (`OpenAPIKeys.tagsMetadata`).

**Questions:**
- Would you consider exporting `setTagsMetadata` or `OpenAPIKeys` from `@typespec/openapi`?
- Is the `Symbol.for(\`${libName}/${key}\`)` convention for `stateKeys` considered stable API?

---

## 6. Duplicate path parameter components for parent/child resources

When using `@parentResource` with `ResourceParameters<T>` and `ResourceCollectionParameters<T>`, the OpenAPI3 emitter generates separate but identical parameter components for the same path parameter. For example, a `Publisher` / `Book` parent-child relationship produces three distinct components that all represent the `publisher` path parameter:

```json
"components": {
  "parameters": {
    "PublisherKey": {
      "name": "publisher", "in": "path", "required": true,
      "description": "The unique identifier of the publisher."
    },
    "BookParentKey": {
      "name": "publisher", "in": "path", "required": true,
      "description": "The unique identifier of the publisher."
    },
    "BookKey.publisher": {
      "name": "publisher", "in": "path", "required": true,
      "description": "The unique identifier of the publisher."
    }
  }
}
```

- `PublisherKey` — used by Publisher's own instance operations (Get/Update/Delete)
- `BookParentKey` — used by Book's collection operations (List/Create)
- `BookKey.publisher` — used by Book's instance operations (Get/Update/Delete/Apply)

These are structurally identical but the emitter creates separate components because they originate from different TypeSpec key model types generated internally by `@typespec/rest`.

**Questions:**
- Is there a way to make `ResourceParameters<T>` and `ResourceCollectionParameters<T>` share the parent's key type instead of creating new ones?
- Would the OpenAPI3 emitter consider deduplicating structurally identical parameter components?
- Is there a recommended workaround (e.g., `@friendlyName` on the implicit key models) that wouldn't require post-processing the output?
