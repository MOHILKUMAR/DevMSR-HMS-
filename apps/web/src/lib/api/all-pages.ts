/** Pages a dropdown loads at most: 2,000 records at 100 per page. */
export const MAX_OPTION_PAGES = 20;

/**
 * Every record of a paged list, for dropdowns that must offer all active choices, not only the first
 * page. Stops at the last page, or at MAX_OPTION_PAGES as a guard against a list that keeps growing.
 */
export async function allPages<T>(fetchPage: (page: number) => Promise<{ data: T[]; pageSize: number; total: number }>): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_OPTION_PAGES; page++) {
    const { data, pageSize, total } = await fetchPage(page);
    items.push(...data);
    if (items.length >= total || data.length < pageSize) break;
  }
  return items;
}
