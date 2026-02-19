/**
 * fractionalIndex.ts
 *
 * orderBetween(prev, next) — returns a float that sits between prev and next.
 *
 * Rules from DESIGN.md §1.3:
 *   - New task at top:    orderBetween(null, existing_min)  → existing_min / 2
 *   - New task at bottom: orderBetween(existing_max, null)  → existing_max + 1
 *   - Between two tasks:  (prev + next) / 2
 *
 * Rebalancing: if gap < Number.EPSILON, trigger a BullMQ rebalance job.
 */
export function orderBetween(
  prev: number | null,
  next: number | null,
): number {
  const lo = prev ?? 0;
  const hi = next ?? lo + 1;
  return (lo + hi) / 2;
}
