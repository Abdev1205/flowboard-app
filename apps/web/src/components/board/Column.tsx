
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, X } from 'lucide-react';
import React, { useState } from 'react';
import type { Task, ColumnId } from '../../types';
import { TaskCard } from './TaskCard';

const COLUMN_META: Record<ColumnId, { label: string; color: string; textColor: string }> = {
  'todo': { label: 'To Do', color: 'var(--color-todo)', textColor: '#334155' },
  'in-progress': { label: 'In Progress', color: 'var(--color-inprogress)', textColor: '#B45309' },
  'done': { label: 'Done', color: 'var(--color-done)', textColor: '#15803D' },
};

interface ColumnProps {
  columnId: ColumnId;
  tasks: Task[];
  conflictIds: Set<string>;
  onCreateTask: (columnId: ColumnId, title: string, description?: string) => void;
  onUpdateTask: (task: Task, updates: Partial<Task>) => void;
  onDeleteTask: (task: Task) => void;
}

export function Column({
  columnId,
  tasks,
  conflictIds,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}: ColumnProps) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  const meta = COLUMN_META[columnId];

  function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    onCreateTask(columnId, title, newDesc.trim() || undefined);
    setNewTitle('');
    setNewDesc('');
    setAdding(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); }
    if (e.key === 'Escape') { setAdding(false); setNewTitle(''); setNewDesc(''); }
  }

  return (
    <div className="flex flex-col w-72 flex-shrink-0 bg-[var(--color-bg-secondary)]/95 rounded-xl h-fit max-h-full">
      {/* Column header */}
      <div 
        className="flex items-center justify-between px-3 py-3 rounded-t-xl"
        style={{ backgroundColor: `color-mix(in srgb, ${meta.color}, transparent 70%)` }}
      >
        <div className="flex items-center gap-2">
          {/* Accent dot */}
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span
            className="text-sm font-semibold tracking-wide"
            style={{ color: meta.textColor }}
          >
            {meta.label}
          </span>
          {/* Task count badge */}
          <span
            className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums"
            style={{
              backgroundColor: `color-mix(in srgb, ${meta.color}, transparent 70%)`,
              color: meta.textColor,
            }}
          >
            {tasks.length}
          </span>
        </div>

        {/* Add button */}
        <button
          onClick={() => setAdding(true)}
          className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-bg-card)] transition-colors"
          aria-label={`Add task to ${meta.label}`}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        style={isOver ? {
          backgroundColor: `color-mix(in srgb, ${meta.color}, transparent 90%)`,
          borderColor: meta.color,
        } : { borderColor: 'transparent' }}
        className={[
          'flex flex-col gap-3 min-h-[50px] transition-all duration-200 p-3',
          'border-2 border-dashed rounded-lg',
        ].join(' ')}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdate={onUpdateTask}
              onDelete={onDeleteTask}
              isConflict={conflictIds.has(task.id)}
            />
          ))}
        </SortableContext>

        {/* Empty state */}
        {tasks.length === 0 && !isOver && (
          <div className="py-8 flex items-center justify-center border-2 border-dashed border-black/5 rounded-lg">
            <p className="text-xs text-[var(--color-text-tertiary)] select-none">
              Drop tasks here
            </p>
          </div>
        )}
      </div>

      {/* Add task form */}
      <div className="px-3 pb-3">
        {adding ? (
          <div
            className={[
              'p-3 rounded-[var(--radius-card)] border border-[var(--color-border)]',
              'bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] animate-fade-in',
            ].join(' ')}
          >
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Task title…"
              className="w-full text-sm bg-transparent outline-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] border-b border-[var(--color-border)] pb-1 mb-2"
              aria-label="New task title"
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setNewTitle(''); }}}
              rows={2}
              placeholder="Description (optional)…"
              className="w-full text-xs bg-transparent outline-none resize-none text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-tertiary)] mb-3"
              aria-label="New task description"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleAdd}
                disabled={!newTitle.trim()}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Add task
              </button>
              <button
                onClick={() => { setAdding(false); setNewTitle(''); setNewDesc(''); }}
                className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)]"
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-black/5 transition-colors"
          >
            <Plus size={13} />
            Add task
          </button>
        )}
      </div>
    </div>
  );
}
