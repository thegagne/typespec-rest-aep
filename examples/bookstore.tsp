import "../lib/main.tsp";

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.Rest.Resource;
using Aep;

@doc("API for managing a bookstore.")
@service(#{ title: "Bookstore API" })
@server("https://api.bookstore.example.com", "Production server")
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
