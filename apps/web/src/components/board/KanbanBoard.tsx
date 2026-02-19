/**
 * components/board/KanbanBoard.tsx
 *
 * Root board component. Owns the DnDContext and orchestrates
 * all drag-and-drop state.
 *
 * Drag flow:
 *   onDragStart  → record active task
 *   onDragOver   → auto-scroll during drag (handled by @dnd-kit/core)
 *   onDragEnd    → call moveTask with { toColumn, overTaskId }
 *
 * Each Column receives its sorted task list from the board store.
 */
import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  closestCenter,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useBoardStore } from '@/store/boardStore';
import { Column }        from './Column';
import { TaskCard }      from './TaskCard';
import type { ColumnId, Task } from '@/types';

const COLUMN_IDS: ColumnId[] = ['todo', 'in-progress', 'done'];

interface KanbanBoardProps {
  onCreateTask: (columnId: ColumnId, title: string, desc?: string) => void;
  onUpdateTask: (task: Task, patch: { title?: string; description?: string }) => void;
  onMoveTask:   (task: Task, toColumn: ColumnId, overTaskId: string | null) => void;
  onDeleteTask: (task: Task) => void;
}

export function KanbanBoard({
  onCreateTask,
  onUpdateTask,
  onMoveTask,
  onDeleteTask,
}: KanbanBoardProps) {
  const { getColumn, getTask } = useBoardStore();
  const [activeTask,   setActiveTask]   = useState<Task | null>(null);
  // const [conflictIds,  setConflictIds]  = useState<Set<string>>(new Set());
  const conflictIds = new Set<string>(); // Placeholder until conflict flashing is implemented

  // Pointer sensor: require 8px drag distance to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );



  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const task = getTask(event.active.id as string);
    if (task) setActiveTask(task);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const task = getTask(active.id as string);
    if (!task) return;

    // `over.id` can be either a columnId or a task id
    const isColumn    = COLUMN_IDS.includes(over.id as ColumnId);
    const toColumn    = isColumn ? (over.id as ColumnId) : getTask(over.id as string)?.columnId;
    const overTaskId  = isColumn ? null : (over.id as string);

    if (!toColumn) return;

    onMoveTask(task, toColumn, overTaskId);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6 p-6 overflow-x-auto flex-1 items-start">
        {COLUMN_IDS.map((columnId) => (
          <Column
            key={columnId}
            columnId={columnId}
            tasks={getColumn(columnId)}
            conflictIds={conflictIds}
            onCreateTask={onCreateTask}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
          />
        ))}
      </div>

      {/* Drag overlay — ghost card following the cursor */}
      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease-out' }}>
        {activeTask && (
          <div className="rotate-2 opacity-90 pointer-events-none">
            <TaskCard
              task={activeTask}
              isOverlay
              onUpdate={() => {}}
              onDelete={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
