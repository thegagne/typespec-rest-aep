# Claude Code Context

## What This Is

A TypeSpec library (`typespec-rest-aep`) that generates AEP-compliant OpenAPI 3.0 specs from TypeSpec definitions. Users define resources with `@aepResource` and compose standard CRUD interfaces. The `$onValidate` hook auto-generates operation IDs, tags, descriptions, examples, and `x-aep-resource` extensions.

## Build / Test / Lint Commands

```bash
npm run build         # tsc -p tsconfig.build.json
npm test              # vitest run
npm run example       # tsp compile examples/bookstore.tsp --emit @typespec/openapi3
npm run lint:aep      # spectral lint example-output/@typespec/openapi3/openapi.json
npm run mock          # prism mock server on port 4010
```

Always run `npm run build` before `npm run example` or `npm test` -- the TypeSpec compiler loads JS from `dist/`.

## Architecture

### TypeSpec Library Contract

- `lib/main.tsp` is the entry point. It MUST import `../dist/src/tsp-index.js` to register JS decorator implementations with the compiler.
- `tsp-index.ts` exports `$lib`, `$onValidate`, and `$decorators` (a map keyed by namespace name `"Aep"`).
- The `$onValidate` hook runs after all decorators are applied, before emitters run.

### Key Files

| File | Purpose |
|------|---------|
| `lib/decorators.tsp` | Declares `extern dec aepResource(...)` |
| `src/decorators.ts` | Implements `$aepResource` -- stores metadata in program state, calls `$resource` |
| `src/validate.ts` | `$onValidate` -- the main logic file. Sets operation IDs, tags, descriptions, `x-aep-resource` extensions, and generates examples |
| `lib/resource.tsp` | Template interfaces (`AepGet`, `AepList`, `AepCreate`, `AepUpdate`, `AepDelete`, `AepApply`, `AepResourceOperations`) |
| `lib/models.tsp` | `AepError` and `AepListResponse<T>` models |
| `test/basic.test.ts` | 16 tests using `createTester` from `@typespec/compiler/testing` |

### How validate.ts Works

The `$onValidate` function iterates all services and:

1. **Model pass** (`navigateTypesInNamespace`): For each `@aepResource` model, sets `x-aep-resource` extension, auto-generates a `@doc` if missing, and registers tag metadata.
2. **Tag sorting**: Sorts root-level tags alphabetically.
3. **Operation pass** (manual interface/operation iteration): For each operation, determines its type (read/list/create/update/delete/createOrReplace/custom action) and sets:
   - `$operationId` (e.g., `GetBook`, `ListBooks`, `:ArchiveBook`)
   - `$tag` (e.g., `Books`)
   - `$doc` (e.g., `Gets a book.`)
   - Operation examples via direct state write to `Symbol.for("TypeSpec.opExamples")`
   - Error response examples for each status code
   - List response schema `results`/`next_page_token` examples via `Symbol.for("TypeSpec.examples")`

### Important Patterns

**Calling decorators programmatically**: Use a fake context `{ program } as any` with decorator functions like `$operationId`, `$doc`, `$tag`.

**Writing to compiler internal state**: Some state can't be set via decorator calls. Use `program.stateMap(Symbol.for("...")).set(target, value)` to write directly. Known keys:
- `TypeSpec.opExamples` -- operation examples
- `TypeSpec.examples` -- property-level examples
- `@typespec/openapi/tagsMetadata` -- root-level OpenAPI tags

**Template interface gotcha**: `navigateTypesInNamespace` with `operation` listener does NOT visit operations inside template-derived interfaces. Must manually iterate `service.type.interfaces.values()` then `iface.operations.values()`.

**`@bodyRoot` descriptions**: Doc comments (`/** */`) on `@bodyRoot` parameters in template interfaces DO work for `requestBody.description` in OpenAPI output. The description appears at the END of the requestBody YAML block (after `content`).

### Resource Model Convention

```typespec
@aepResource("example.com/widget", "widget", "widgets")
model Widget {
  @key("widget") @visibility(Lifecycle.Read) id: string;  // URL routing key
  path: string;                                            // Full AEP resource name
  displayName: string;                                     // Business fields
}
```

- `id` with `@key` + `@visibility(Lifecycle.Read)`: excluded from create/update request bodies
- `path`: the full resource name (e.g., `publishers/acme/books/great-gatsby`), always present in schemas

### Testing

Tests use `createTester(projectRoot, { libraries: [...] })` and `.using("Aep", "TypeSpec.Rest")`. The tester compiles TypeSpec inline and emits OpenAPI3 YAML which is parsed and asserted against.

Key namespaces to `.using()`:
- `"Aep"` -- always needed
- `"TypeSpec.Rest"` -- for `@parentResource`
- `"TypeSpec.Http"`, `"TypeSpec.Rest.Resource"` -- for custom actions

### AEP Linter Rules to Know

- `x-aep-resource.type` must be all lowercase
- `x-aep-resource.patterns` must include full parent path
- All schemas with `x-aep-resource` must have a `path` property
- Custom method operation IDs must start with `:` (AEP-136)
- Error `type` property needs `@format("uri-reference")`
- All schema properties should have `example` or `examples`
- `requestBody` must have a `description`
