import { describe, it, expect } from "vitest";
import { createTester, expectDiagnosticEmpty } from "@typespec/compiler/testing";
import { parse } from "yaml";
import { resolve } from "path";

const tester = createTester(resolve(import.meta.dirname, ".."), {
  libraries: [
    "typespec-rest-aep",
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
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
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
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
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
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
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
        @key("publisher") @visibility(Lifecycle.Read) id: string;
        path: string;
        displayName: string;
      }

      @aepResource("test.example.com/book", "book", "books")
      @parentResource(Publisher)
      model Book {
        @key("book") @visibility(Lifecycle.Read) id: string;
        path: string;
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
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
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
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
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
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
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
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
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
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const createOp = openapi.paths["/widgets"].post;
    const paramNames = createOp.parameters.map((p: any) => p.name);
    expect(paramNames).toContain("id");
  });

  it("should generate PUT endpoint for AepApply with correct operationId", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget>, AepApply<Widget> {}
    `);

    // Apply should generate a PUT endpoint
    expect(openapi.paths["/widgets/{widget}"].put).toBeDefined();
    expect(openapi.paths["/widgets/{widget}"].put.operationId).toBe(
      "ApplyWidget"
    );

    // PUT should have a request body referencing the Widget schema
    expect(
      openapi.paths["/widgets/{widget}"].put.requestBody.content[
        "application/json"
      ].schema.$ref
    ).toBe("#/components/schemas/Widget");
  });

  it("should generate custom action with colon separator and correct operationId", async () => {
    const restTester = tester
      .importLibraries()
      .using("Aep", "TypeSpec.Http", "TypeSpec.Rest", "TypeSpec.Rest.Resource")
      .emit("@typespec/openapi3")
      .pipe((result) => {
        const yamlFile = Object.values(result.outputs).find((v) =>
          v.includes("openapi:")
        );
        return parse(yamlFile!);
      });

    const openapi = await restTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {
        @doc("Archives a widget.")
        @autoRoute
        @action("archive")
        @actionSeparator(":")
        @post
        archive(...ResourceParameters<Widget>): Widget | AepError;
      }
    `);

    // Custom action path uses colon separator
    expect(openapi.paths).toHaveProperty("/widgets/{widget}:archive");

    // Custom action has correct AEP-136 operation ID (starts with colon)
    const archiveOp = openapi.paths["/widgets/{widget}:archive"].post;
    expect(archiveOp.operationId).toBe(":ArchiveWidget");
  });

  it("should include example on Get operation response", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const getOp = openapi.paths["/widgets/{widget}"].get;
    // The 200 response should have an example with resource fields
    const response200 = getOp.responses["200"].content["application/json"];
    expect(response200.example).toBeDefined();
    expect(response200.example).toHaveProperty("path");
    expect(response200.example).toHaveProperty("name");
  });

  it("should include example on List operation response", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const listOp = openapi.paths["/widgets"].get;
    const response200 = listOp.responses["200"].content["application/json"];
    expect(response200.example).toBeDefined();
    expect(response200.example).toHaveProperty("results");
    expect(response200.example.results).toBeInstanceOf(Array);
    expect(response200.example.results.length).toBeGreaterThan(0);
    expect(response200.example).toHaveProperty("next_page_token");
  });

  it("should include example on Create operation request body", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
        name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const createOp = openapi.paths["/widgets"].post;
    const requestBody = createOp.requestBody.content["application/json"];
    expect(requestBody.example).toBeDefined();
    expect(requestBody.example).toHaveProperty("path");
    expect(requestBody.example).toHaveProperty("name");
  });

  it("should use @example values from model properties in operation examples", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
        @example("Acme Widget") name: string;
      }

      interface Widgets extends AepResourceOperations<Widget> {}
    `);

    const getOp = openapi.paths["/widgets/{widget}"].get;
    const response200 = getOp.responses["200"].content["application/json"];
    expect(response200.example.name).toBe("Acme Widget");
    // path should still be auto-generated since no @example on it
    expect(response200.example.path).toContain("my-widget");
  });

  it("should support selective interface composition (read-only)", async () => {
    const openapi = await openApiTester.compile(`
      @service(#{ title: "Test API" })
      namespace TestAPI;

      @aepResource("test.example.com/widget", "widget", "widgets")
      model Widget {
        @key("widget") @visibility(Lifecycle.Read) id: string;
        path: string;
        name: string;
      }

      interface Widgets extends AepGet<Widget>, AepList<Widget> {}
    `);

    // Only Get and List should exist
    expect(openapi.paths["/widgets"].get).toBeDefined();
    expect(openapi.paths["/widgets/{widget}"].get).toBeDefined();

    // No Create, Update, or Delete
    expect(openapi.paths["/widgets"].post).toBeUndefined();
    expect(openapi.paths["/widgets/{widget}"].patch).toBeUndefined();
    expect(openapi.paths["/widgets/{widget}"].delete).toBeUndefined();

    // Operation IDs are still correct
    expect(openapi.paths["/widgets"].get.operationId).toBe("ListWidgets");
    expect(openapi.paths["/widgets/{widget}"].get.operationId).toBe(
      "GetWidget"
    );
  });
});
