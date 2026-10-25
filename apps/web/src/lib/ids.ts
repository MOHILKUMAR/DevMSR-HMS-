const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Record ids in URLs are UUIDs (section 7). Anything else is the not found page, without asking the API. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
