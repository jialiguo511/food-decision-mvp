/** Normalizes an `image_query` before it's used as a cache key or a provider
 *  search term: lowercase, trimmed, repeated whitespace collapsed to one
 *  space. Two differently-formatted requests for the same dish should share
 *  one cache entry and one Pexels lookup. */
export function normalizeImageQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}
