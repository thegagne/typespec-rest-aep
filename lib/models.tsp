namespace Aep;

/**
 * Standard error response following AEP-193.
 */
model AepError {
  @TypeSpec.Http.statusCode _: 400 | 401 | 403 | 404 | 409 | 500;
  @format("uri-reference") @example("https://example.com/errors/bad-request") type?: string;
  @example("Bad Request") title?: string;
  @example(400) status?: int32;
  @example("The request was invalid.") detail?: string;
}

/**
 * Paged list response for AEP resources.
 * Contains an array of results and a next_page_token for pagination.
 *
 * @template Resource The resource type being listed.
 */
@friendlyName("{name}ListResponse", Resource)
model AepListResponse<Resource extends {}> {
  /** The list of resources. */
  results: Resource[];

  /** Token to retrieve the next page of results. Empty if no more results. */
  next_page_token?: string;
}
