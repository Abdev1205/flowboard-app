
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergeMovAndEdit, buildConflictPayload } from '../services/conflictService';
import type { Task, ColumnId } from '../services/taskService';

// Mock helper
const mockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  columnId: 'todo',
  title: 'Original Title',
  description: 'Original Desc',
  order: 1000,
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
  version: 1,
  ...overrides,
});

describe('conflictService', () => {
  describe('mergeMovAndEdit', () => {
    it('should merge orthogonal changes (Move + Edit)', () => {
      const current = mockTask({ version: 1 });
      
      const move = { columnId: 'done' as ColumnId, order: 2000 };
      const edit = { title: 'New Title', description: 'New Desc' };

      const merged = mergeMovAndEdit(current, move, edit);

      assert.strictEqual(merged.columnId, 'done');     // Move applied
      assert.strictEqual(merged.order, 2000);          // Move applied
      assert.strictEqual(merged.title, 'New Title');   // Edit applied
      assert.strictEqual(merged.description, 'New Desc'); // Edit applied
      assert.strictEqual(merged.version, 2);           // Version incremented
    });

    it('should handle Move only (no edit)', () => {
      const current = mockTask({ version: 1 });
      const move = { columnId: 'done' as ColumnId, order: 2000 };

      const merged = mergeMovAndEdit(current, move, null);

      assert.strictEqual(merged.columnId, 'done');
      assert.strictEqual(merged.title, 'Original Title');
      assert.strictEqual(merged.version, 2);
    });

    it('should handle Edit only (no move)', () => {
      const current = mockTask({ version: 1 });
      const edit = { title: 'New Title', description: 'New Desc' };

      const merged = mergeMovAndEdit(current, null, edit);

      assert.strictEqual(merged.columnId, 'todo');
      assert.strictEqual(merged.title, 'New Title');
      assert.strictEqual(merged.version, 2);
    });
  });

  describe('buildConflictPayload', () => {
    it('should build correct payload for MOVE conflict', () => {
      const resolved = mockTask({ version: 5 });
      const payload = buildConflictPayload('t1', resolved, 'TASK_MOVE');

      assert.strictEqual(payload.taskId, 't1');
      assert.strictEqual(payload.resolvedState, resolved);
      assert.match(payload.message, /moved/);
    });

    it('should build correct payload for UPDATE conflict', () => {
      const resolved = mockTask({ version: 5 });
      const payload = buildConflictPayload('t1', resolved, 'TASK_UPDATE');

      assert.strictEqual(payload.taskId, 't1');
      assert.strictEqual(payload.resolvedState, resolved);
      assert.match(payload.message, /updated/);
    });
  });
});
