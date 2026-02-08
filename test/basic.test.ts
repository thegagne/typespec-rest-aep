import { describe, it, expect } from "vitest";
import { createTester, expectDiagnosticEmpty } from "@typespec/compiler/testing";
import { parse } from "yaml";
import { resolve } from "path";

const tester = createTester(resolve(import.meta.dirname, ".."), {
  libraries: [
    "@typespec-rest-aep/core",
    "@typespec/rest",
    "@typespec/openapi3",
  ],
});

const openApiTester = tester
  .importLibraries()
  .using("Aep")
  .emit("@typespec/openapi3")
  .pipe((result) => {
    const yamlFile = Object.values(result.outputs).find((v) =>
      v.includes("openapi:")
    );
    return parse(yamlFile!);
  });

describe("@aepResource decorator", () => {
  it("should compile without diagnostics", async () => {
    const diagnostics = await tester.importLibraries().using("Aep").diagnose(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);
    expectDiagnosticEmpty(diagnostics);
  });
});

describe("OpenAPI output", () => {
  it("should generate correct paths for a simple resource", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    expect(openapi.paths).toHaveProperty("/widgets");
    expect(openapi.paths).toHaveProperty("/widgets/{widget}");

    // List
    expect(openapi.paths["/widgets"].get.operationId).toBe("ListWidgets");
    // Create
    expect(openapi.paths["/widgets"].post.operationId).toBe("CreateWidget");
    // Get
    expect(openapi.paths["/widgets/{widget}"].get.operationId).toBe(
      "GetWidget"
    );
    // Update
    expect(openapi.paths["/widgets/{widget}"].patch.operationId).toBe(
      "UpdateWidget"
    );
    // Delete
    expect(openapi.paths["/widgets/{widget}"].delete.operationId).toBe(
      "DeleteWidget"
    );
  });

  it("should set x-aep-resource extension on schema", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const widgetSchema = openapi.components.schemas.Widget;
    expect(widgetSchema["x-aep-resource"]).toEqual({
      type: "test.example.com/widget",
      singular: "widget",
      plural: "widgets",
      patterns: ["widgets/{widget}"],
    });
  });

  it("should generate correct nested paths for parent/child resources", async () => {
    const nestedTester = tester
      .importLibraries()
      .using("Aep", "TypeSpec.Rest")
      .emit("@typespec/openapi3")
      .pipe((result) => {
        const yamlFile = Object.values(result.outputs).find((v) =>
          v.includes("openapi:")
        );
        return parse(yamlFile!);
      });

    const openapi = await nestedTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/publisher", "publisher", "publishers")
      model Publisher {
        @key("publisher") path: string;
        displayName: string;
      }

      @aepResource("test.example.com/book", "book", "books")
      @parentResource(Publisher)
      model Book {
        @key("book") path: string;
        title: string;
      }

      interface Publishers extends AepResourceOperations<Publisher> {}
      interface Books extends AepResourceOperations<Book> {}
    `);

    // Publisher paths
    expect(openapi.paths).toHaveProperty("/publishers");
    expect(openapi.paths).toHaveProperty("/publishers/{publisher}");

    // Book paths (nested under publisher)
    expect(openapi.paths).toHaveProperty("/publishers/{publisher}/books");
    expect(openapi.paths).toHaveProperty(
      "/publishers/{publisher}/books/{book}"
    );

    // Book pattern should include parent path
    const bookSchema = openapi.components.schemas.Book;
    expect(bookSchema["x-aep-resource"].patterns).toEqual([
      "publishers/{publisher}/books/{book}",
    ]);
  });

  it("should use application/merge-patch+json for update", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const updateOp = openapi.paths["/widgets/{widget}"].patch;
    expect(updateOp.requestBody.content).toHaveProperty(
      "application/merge-patch+json"
    );
  });

  it("should return 204 for delete", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const deleteOp = openapi.paths["/widgets/{widget}"].delete;
    expect(deleteOp.responses).toHaveProperty("204");
  });

  it("should include pagination parameters in list operation", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const listOp = openapi.paths["/widgets"].get;
    const paramNames = listOp.parameters.map((p: any) => p.name);
    expect(paramNames).toContain("max_page_size");
    expect(paramNames).toContain("page_token");
    expect(paramNames).toContain("filter");
    expect(paramNames).toContain("order_by");
  });

  it("should include pagination fields in list response", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const listResponse =
      openapi.components.schemas.WidgetListResponse;
    expect(listResponse.properties).toHaveProperty("results");
    expect(listResponse.properties.results.type).toBe("array");
    expect(listResponse.properties).toHaveProperty("next_page_token");
  });

  it("should include id query parameter in create operation", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const createOp = openapi.paths["/widgets"].post;
    const paramNames = createOp.parameters.map((p: any) => p.name);
    expect(paramNames).toContain("id");
  });
});
