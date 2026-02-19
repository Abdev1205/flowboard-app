
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { orderBetween, rebalancedOrders, needsRebalance } from '../lib/fractionalIndex';

describe('fractionalIndex', () => {
  describe('orderBetween', () => {
    it('should return 0.5 for empty list (null, null)', () => {
      const result = orderBetween(null, null);
      assert.strictEqual(result, 0.5);
    });

    it('should return midpoint for regular insertion (10, 20) -> 15', () => {
      const result = orderBetween(10, 20);
      assert.strictEqual(result, 15);
    });

    it('should append to bottom (10, null) -> 11', () => {
      const result = orderBetween(10, null);
      assert.strictEqual(result, 10.5);
    });

    it('should insert at top (null, 10) -> 5', () => {
      const result = orderBetween(null, 10);
      assert.strictEqual(result, 5);
    });

    it('should work with floats (0.5, 0.75) -> 0.625', () => {
      const result = orderBetween(0.5, 0.75);
      assert.strictEqual(result, 0.625);
    });

    it('should throw if prev >= next', () => {
      assert.throws(() => orderBetween(10, 5), /must be less than/);
      assert.throws(() => orderBetween(10, 10), /must be less than/);
    });
  });

  describe('needsRebalance', () => {
    it('should return false for large gaps', () => {
      assert.strictEqual(needsRebalance(10, 11), false);
    });

    it('should return true for very small gaps', () => {
      // Threshold is 1e-9
      const base = 10;
      const small = base + 1e-10; 
      assert.strictEqual(needsRebalance(base, small), true);
    });
  });

  describe('rebalancedOrders', () => {
    it('should return integer multiples of 1000', () => {
      const orders = rebalancedOrders(3);
      assert.deepStrictEqual(orders, [1000, 2000, 3000]);
    });
  });
});
