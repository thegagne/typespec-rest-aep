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
  @autoRoute
  @readsResource(Resource)
  get(...ResourceParameters<Resource>): Resource | ProblemDetails;
}

/**
 * List AEP resources with pagination.
 *
 * @template Resource The AEP resource model.
 */
interface AepList<Resource extends {}> {
  @autoRoute
  @listsResource(Resource)
  list(
    ...ResourceCollectionParameters<Resource>,
    /** The maximum number of results to return per page. */
    @query max_page_size?: int32,
    /** A page token from a previous list response, used to retrieve the next page. */
    @query page_token?: string,
    /** A CEL filter expression to restrict results. */
    @query filter?: string,
    /** A comma-separated list of fields to order results by. */
    @query order_by?: string,
  ): AepListResponse<Resource> | ProblemDetails;
}

/**
 * Create a new AEP resource.
 *
 * @template Resource The AEP resource model.
 */
interface AepCreate<Resource extends {}> {
  @autoRoute
  @createsResource(Resource)
  create(
    ...ResourceCollectionParameters<Resource>,
    /** An optional client-provided identifier for the resource. */
    @query id?: string,
    /** The resource to create. */
    @bodyRoot resource: Resource,
  ): Resource | ProblemDetails;
}

/**
 * Update an existing AEP resource using merge-patch.
 *
 * @template Resource The AEP resource model.
 */
interface AepUpdate<Resource extends {}> {
  @autoRoute
  @updatesResource(Resource)
  @patch(#{ implicitOptionality: true })
  update(
    ...ResourceParameters<Resource>,
    @header contentType: "application/merge-patch+json",
    /** The resource fields to update. */
    @bodyRoot resource: Resource,
  ): Resource | ProblemDetails;
}

/**
 * Delete an AEP resource.
 *
 * @template Resource The AEP resource model.
 */
interface AepDelete<Resource extends {}> {
  @autoRoute
  @deletesResource(Resource)
  delete(...ResourceParameters<Resource>): {
    @TypeSpec.Http.statusCode _: 204;
  } | ProblemDetails;
}

/**
 * Apply (create or replace) an AEP resource via PUT (AEP-137).
 *
 * @template Resource The AEP resource model.
 */
interface AepApply<Resource extends {}> {
  @autoRoute
  @createsOrReplacesResource(Resource)
  apply(...ResourceParameters<Resource>, /** The resource to create or replace. */ @bodyRoot resource: Resource): Resource | ProblemDetails;
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
