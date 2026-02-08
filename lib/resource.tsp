import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";

namespace Aep;

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.Rest.Resource;
using TypeSpec.OpenAPI;

/**
 * Get a single AEP resource by its key.
 *
 * @template Resource The AEP resource model.
 */
interface AepGet<Resource extends {}> {
  @doc("Gets a single resource.")
  @autoRoute
  @readsResource(Resource)
  get(...ResourceParameters<Resource>): Resource | AepError;
}

/**
 * List AEP resources with pagination.
 *
 * @template Resource The AEP resource model.
 */
interface AepList<Resource extends {}> {
  @doc("Lists resources with pagination.")
  @autoRoute
  @listsResource(Resource)
  list(
    ...ResourceCollectionParameters<Resource>,
    @query max_page_size?: int32,
    @query page_token?: string,
    @query filter?: string,
    @query order_by?: string,
  ): AepListResponse<Resource> | AepError;
}

/**
 * Create a new AEP resource.
 *
 * @template Resource The AEP resource model.
 */
interface AepCreate<Resource extends {}> {
  @doc("Creates a new resource.")
  @autoRoute
  @createsResource(Resource)
  create(
    ...ResourceCollectionParameters<Resource>,
    @query id?: string,
    @bodyRoot resource: Resource,
  ): Resource | AepError;
}

/**
 * Update an existing AEP resource using merge-patch.
 *
 * @template Resource The AEP resource model.
 */
interface AepUpdate<Resource extends {}> {
  @doc("Updates an existing resource using merge-patch semantics.")
  @autoRoute
  @updatesResource(Resource)
  @patch(#{ implicitOptionality: true })
  update(
    ...ResourceParameters<Resource>,
    @header contentType: "application/merge-patch+json",
    @bodyRoot resource: Resource,
  ): Resource | AepError;
}

/**
 * Delete an AEP resource.
 *
 * @template Resource The AEP resource model.
 */
interface AepDelete<Resource extends {}> {
  @doc("Deletes an existing resource.")
  @autoRoute
  @deletesResource(Resource)
  delete(...ResourceParameters<Resource>): {
    @TypeSpec.Http.statusCode _: 204;
  } | AepError;
}

/**
 * All standard AEP CRUD operations: Get, List, Create, Update, Delete.
 *
 * @template Resource The AEP resource model.
 */
interface AepResourceOperations<Resource extends {}>
  extends AepGet<Resource>,
    AepList<Resource>,
    AepCreate<Resource>,
    AepUpdate<Resource>,
    AepDelete<Resource> {}
