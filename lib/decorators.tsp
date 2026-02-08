import "@typespec/compiler";

using TypeSpec.Reflection;

namespace Aep;

/**
 * Marks a model as an AEP resource and attaches resource metadata.
 *
 * @param type The resource type identifier (e.g., "library.example.com/Book").
 * @param singular The singular name of the resource (e.g., "book").
 * @param plural The plural name of the resource (e.g., "books").
 */
extern dec aepResource(target: Model, type: valueof string, singular: valueof string, plural: valueof string);
