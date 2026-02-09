# @typespec-rest-aep/core

A TypeSpec library for defining [AEP](https://aep.dev)-compliant REST APIs. Define your resources with a single decorator and get fully compliant OpenAPI 3.0 output validated by the official AEP linter.

## Quick Start

```typespec
import "@typespec-rest-aep/core";

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.Rest.Resource;
using Aep;

@service(#{ title: "Bookstore API" })
@server("https://api.bookstore.example.com", "Production")
namespace BookstoreAPI;

@aepResource("library.example.com/publisher", "publisher", "publishers")
model Publisher {
  @doc("The unique identifier of the publisher.")
  @example("acme-publishing")
  @key("publisher") @visibility(Lifecycle.Read) id: string;
  @doc("The full resource name of the publisher.")
  @example("publishers/acme-publishing") path: string;
  @doc("The display name of the publisher.")
  @example("Acme Publishing") displayName: string;
}

@aepResource("library.example.com/book", "book", "books")
@parentResource(Publisher)
model Book {
  @doc("The unique identifier of the book.")
  @example("great-gatsby")
  @key("book") @visibility(Lifecycle.Read) id: string;
  @doc("The full resource name of the book.")
  @example("books/great-gatsby") path: string;
  @doc("The title of the book.")
  @example("The Great Gatsby") title: string;
  @doc("The ISBN of the book.")
  @example("978-0-7432-7356-5") isbn: string;
}

interface Publishers extends AepResourceOperations<Publisher> {}
interface Books extends AepResourceOperations<Book>, AepApply<Book> {
  @doc("Archives a book.")
  @autoRoute
  @action("archive")
  @actionSeparator(":")
  @post
  archive(...ResourceParameters<Book>): Book | AepError;
}
```

This generates OpenAPI 3.0 with:

- Correct paths: `/publishers/{publisher}`, `/publishers/{publisher}/books/{book}`
- AEP operation IDs: `ListPublishers`, `GetPublisher`, `CreateBook`, `UpdateBook`, `DeleteBook`, `ApplyBook`
- Custom method: `POST /publishers/{publisher}/books/{book}:archive` with operationId `:ArchiveBook`
- `x-aep-resource` extensions with type, singular, plural, and patterns
- Root-level tags (alphabetically sorted) with descriptions
- Pagination (`results` + `next_page_token`) on list operations
- `application/merge-patch+json` for updates
- `204 No Content` for deletes
- AEP-193 error responses with examples for each status code
- Operation examples for all CRUD operations
- Schema-level examples on list response `results` properties
- `requestBody` descriptions on create, update, and apply operations

## Installation

```bash
npm install @typespec-rest-aep/core
```

Peer dependencies (install alongside):

```bash
npm install @typespec/compiler @typespec/http @typespec/rest @typespec/openapi @typespec/openapi3
```

## API Reference

### `@aepResource(type, singular, plural)`

Marks a model as an AEP resource. This is the only decorator you need.

| Parameter | Description | Example |
|-----------|-------------|---------|
| `type` | Resource type identifier (must be all lowercase) | `"library.example.com/book"` |
| `singular` | Singular form of the resource name | `"book"` |
| `plural` | Plural form (used as the URL collection segment) | `"books"` |

The library automatically handles:

- Registers the model as a REST resource (via `@resource` from `@typespec/rest`)
- Sets the `x-aep-resource` OpenAPI extension with `type`, `singular`, `plural`, and `patterns`
- Generates AEP-compliant operation IDs, descriptions, and tags for all CRUD operations
- Builds operation examples from `@example` values on model properties
- Generates error response examples for each status code
- Sets schema-level examples on list response properties
- Auto-generates a model description if none is provided via `@doc`

### Resource Model Convention

Each AEP resource model should have:

- An `id` property with `@key("name")` and `@visibility(Lifecycle.Read)` for URL routing
- A `path` property for the full AEP resource name
- `@doc` and `@example` on each property for schema documentation and examples

```typespec
@aepResource("example.com/widget", "widget", "widgets")
model Widget {
  @doc("The unique identifier of the widget.")
  @example("my-widget")
  @key("widget") @visibility(Lifecycle.Read) id: string;
  @doc("The full resource name of the widget.")
  @example("widgets/my-widget") path: string;
  @doc("The display name of the widget.")
  @example("My Widget") displayName: string;
}
```

The `@key` parameter name controls the URL parameter name, and `@visibility(Lifecycle.Read)` keeps `id` out of create/update request bodies. The `path` property holds the full resource name (e.g., `publishers/acme/books/great-gatsby`).

### Template Interfaces

Use these to add standard CRUD operations to your resources:

| Interface | Operations | HTTP |
|-----------|-----------|------|
| `AepResourceOperations<T>` | Get, List, Create, Update, Delete | - |
| `AepGet<T>` | Get by key | `GET /{id}` |
| `AepList<T>` | List with pagination | `GET /` |
| `AepCreate<T>` | Create with optional `id` | `POST /` |
| `AepUpdate<T>` | Merge-patch update | `PATCH /{id}` |
| `AepDelete<T>` | Delete | `DELETE /{id}` |
| `AepApply<T>` | Create or replace (AEP-137) | `PUT /{id}` |

`AepResourceOperations<T>` includes Get, List, Create, Update, and Delete. Apply is separate -- compose it when needed:

```typespec
// All standard CRUD operations
interface Widgets extends AepResourceOperations<Widget> {}

// CRUD + Apply (PUT)
interface Widgets extends AepResourceOperations<Widget>, AepApply<Widget> {}

// Read-only
interface Widgets extends AepGet<Widget>, AepList<Widget> {}
```

### Custom Methods (AEP-136)

Define custom actions using `@action` and `@actionSeparator(":")` from `@typespec/rest`:

```typespec
interface Books extends AepResourceOperations<Book> {
  @doc("Archives a book.")
  @autoRoute
  @action("archive")
  @actionSeparator(":")
  @post
  archive(...ResourceParameters<Book>): Book | AepError;
}
```

This generates `POST /books/{book}:archive` with operationId `:ArchiveBook` (AEP-136 compliant).

For collection-level actions, use `@collectionAction`:

```typespec
interface Books extends AepResourceOperations<Book> {
  @doc("Imports books in bulk.")
  @autoRoute
  @collectionAction(Book, "import")
  @actionSeparator(":")
  @post
  bulkImport(...ResourceCollectionParameters<Book>): {} | AepError;
}
```

### Models

**`AepListResponse<T>`** - Paginated list response with `results: T[]` and `next_page_token?: string`.

**`AepError`** - Standard error response per AEP-193 with `type`, `title`, `status`, and `detail` fields.

### Nested Resources

Use `@parentResource` from `@typespec/rest` to define parent-child relationships:

```typespec
@aepResource("example.com/publisher", "publisher", "publishers")
model Publisher {
  @key("publisher") @visibility(Lifecycle.Read) id: string;
  path: string;
  name: string;
}

@aepResource("example.com/book", "book", "books")
@parentResource(Publisher)
model Book {
  @key("book") @visibility(Lifecycle.Read) id: string;
  path: string;
  title: string;
}
```

This generates nested paths like `/publishers/{publisher}/books/{book}` and sets the full pattern in `x-aep-resource`.

## Validating with the AEP Linter

Install the linter:

```bash
npm install -D @aep_dev/aep-openapi-linter @stoplight/spectral-cli
```

Create `.spectral.yaml`:

```yaml
extends:
  - "@aep_dev/aep-openapi-linter"
```

Compile and lint:

```bash
tsp compile . --emit @typespec/openapi3
npx spectral lint tsp-output/@typespec/openapi3/openapi.yaml
```

## Development

```bash
npm install
npm run build    # Compile TypeScript
npm test         # Run tests (vitest)
npm run example  # Compile the bookstore example
npm run lint:aep # Lint the example output with AEP linter
npm run watch    # Watch mode for TypeScript
```

## Project Structure

```
lib/
  main.tsp          # Library entry point (imports JS + TSP files)
  decorators.tsp    # @aepResource decorator declaration
  models.tsp        # AepError, AepListResponse
  resource.tsp      # Template interfaces (AepGet, AepList, etc.)
src/
  lib.ts            # Library definition (createTypeSpecLibrary)
  decorators.ts     # @aepResource implementation + metadata accessors
  validate.ts       # $onValidate hook (operation IDs, tags, examples, extensions)
  tsp-index.ts      # Decorator registry ($decorators map, $onValidate export)
  index.ts          # Public JS exports
test/
  basic.test.ts     # Tests (16 tests covering all operations and features)
examples/
  bookstore.tsp     # Full bookstore example (Publisher + Book resources)
```

## License

MIT
