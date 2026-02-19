/**
 * lib/fractionalIndex.ts  (server)
 *
 * Canonical implementation of the orderBetween() helper.
 * Matches the algorithm described in DESIGN.md §1.3 and §2.
 *
 * Rules:
 *   new task at top:    orderBetween(null, existingMin)  → existingMin / 2
 *   new task at bottom: orderBetween(existingMax, null)  → existingMax + 1
 *   between two tasks:  orderBetween(prev, next)         → (prev + next) / 2
 *
 * Rebalancing trigger:
 *   If the resulting gap between adjacent orders falls below Number.EPSILON,
 *   call triggerRebalance(). This is extremely rare in practice.
 */

/** Gap threshold below which we trigger a rebalance job. */
const REBALANCE_THRESHOLD = 1e-9;

/**
 * Returns a float that sorts between `prev` and `next`.
 * O(1) — no other tasks are touched.
 *
 * @param prev  The order value of the task immediately above, or null if inserting at the top.
 * @param next  The order value of the task immediately below, or null if inserting at the bottom.
 */
export function orderBetween(
  prev: number | null,
  next: number | null,
): number {
  const lo = prev ?? 0;
  const hi = next ?? lo + 1;

  if (lo >= hi) {
    // Defensive: should never happen in a well-ordered list, but guard anyway
    throw new RangeError(
      `orderBetween: prev (${lo}) must be less than next (${hi})`,
    );
  }

  return (lo + hi) / 2;
}

/**
 * Returns true when the gap between two adjacent order values is too small
 * to safely insert another task. Call triggerRebalance() when this is true.
 */
export function needsRebalance(prev: number, next: number): boolean {
  return Math.abs(next - prev) < REBALANCE_THRESHOLD;
}

/**
 * Generates a fully-spread order sequence for N tasks.
 * Used by the BullMQ rebalance job when gaps have been exhausted.
 *
 * Assigns integer multiples of 1000 (1000, 2000, 3000, …)
 * giving 999 safe insertion points between each pair.
 */
export function rebalancedOrders(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * 1000);
}
