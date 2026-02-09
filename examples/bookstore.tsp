import "../lib/main.tsp";

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.Rest.Resource;
using TypeSpec.OpenAPI;
using Aep;

@doc("API for managing a bookstore.")
@service(#{ title: "Bookstore API" })
@info(#{ contact: #{ name: "Bookstore API Support", email: "support@bookstore.example.com", url: "https://example.com" }, license: #{ name: "MIT" } })
@server("https://api.bookstore.example.com", "Production server")
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
