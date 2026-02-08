# @typespec-rest-aep/core

A TypeSpec library for defining [AEP](https://aep.dev)-compliant REST APIs. Define your resources with a single decorator and get fully compliant OpenAPI 3.0 output validated by the official AEP linter.

## Quick Start

```typespec
import "@typespec-rest-aep/core";

using TypeSpec.Http;
using TypeSpec.Rest;
using Aep;

@service(#{ title: "Bookstore API" })
@server("https://api.bookstore.example.com", "Production")
namespace BookstoreAPI;

@aepResource("library.example.com/publisher", "publisher", "publishers")
model Publisher {
  @key("publisher") path: string;
  displayName: string;
}

@aepResource("library.example.com/book", "book", "books")
@parentResource(Publisher)
model Book {
  @key("book") path: string;
  title: string;
  isbn: string;
}

interface Publishers extends AepResourceOperations<Publisher> {}
interface Books extends AepResourceOperations<Book> {}
```

This generates OpenAPI 3.0 with:

- Correct paths: `/publishers`, `/publishers/{publisher}`, `/publishers/{publisher}/books/{book}`
- AEP operation IDs: `ListPublishers`, `GetPublisher`, `CreateBook`, `UpdateBook`, `DeleteBook`
- `x-aep-resource` extensions with type, singular, plural, and patterns
- Pagination (`results` + `next_page_token`) on list operations
- `application/merge-patch+json` for updates
- `204 No Content` for deletes
- AEP-193 error responses

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

Under the hood, `@aepResource` does the following:

- Registers the model as a REST resource (via `@resource` from `@typespec/rest`)
- Sets the `x-aep-resource` OpenAPI extension with `type`, `singular`, `plural`, and `patterns`
- Generates AEP-compliant operation IDs for all CRUD operations

### Template Interfaces

Use these to add standard CRUD operations to your resources:

| Interface | Operations | HTTP |
|-----------|-----------|------|
| `AepResourceOperations<T>` | All five below | - |
| `AepGet<T>` | Get by key | `GET /{id}` |
| `AepList<T>` | List with pagination | `GET /` |
| `AepCreate<T>` | Create with optional `id` | `POST /` |
| `AepUpdate<T>` | Merge-patch update | `PATCH /{id}` |
| `AepDelete<T>` | Delete | `DELETE /{id}` |

You can use `AepResourceOperations<T>` for all five, or compose individual interfaces:

```typespec
// All operations
interface Widgets extends AepResourceOperations<Widget> {}

// Read-only
interface Widgets extends AepGet<Widget>, AepList<Widget> {}
```

### Models

**`AepListResponse<T>`** - Paginated list response with `results: T[]` and `next_page_token?: string`.

**`AepError`** - Standard error response per AEP-193 with `type`, `title`, `status`, and `detail` fields.

### Nested Resources

Use `@parentResource` from `@typespec/rest` to define parent-child relationships:

```typespec
@aepResource("example.com/publisher", "publisher", "publishers")
model Publisher {
  @key("publisher") path: string;
  name: string;
}

@aepResource("example.com/book", "book", "books")
@parentResource(Publisher)
model Book {
  @key("book") path: string;
  title: string;
}
```

This generates nested paths like `/publishers/{publisher}/books/{book}` and sets the full pattern in `x-aep-resource`.

### Key Naming Convention

The `@key` parameter name controls the URL parameter name. Use snake_case names that match the singular resource name:

```typespec
@key("publisher") path: string;  // -> /publishers/{publisher}
```

The property name (`path`) becomes the schema property name in the OpenAPI output.

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
npm test         # Run tests
npm run watch    # Watch mode
```

## Project Structure

```
lib/
  main.tsp          # Library entry point
  decorators.tsp    # @aepResource decorator declaration
  models.tsp        # AepError, AepListResponse
  resource.tsp      # Template interfaces (AepGet, AepList, etc.)
src/
  lib.ts            # Library definition
  decorators.ts     # @aepResource implementation
  validate.ts       # $onValidate hook (sets operation IDs + extensions)
  tsp-index.ts      # Decorator registry
  index.ts          # Public exports
test/
  basic.test.ts     # Tests
examples/
  bookstore.tsp     # Example API
```

## License

MIT
