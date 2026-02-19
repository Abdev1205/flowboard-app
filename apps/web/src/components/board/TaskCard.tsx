/**
 * components/board/TaskCard.tsx
 *
 * Individual task card shown inside a Column.
 *
 * Features:
 *   - dnd-kit useSortable for drag handle
 *   - Inline editing for title and description (double-click)
 *   - Presence avatar ring when another user is editing this task
 *   - Delete button on hover
 *   - Visual conflict flash on rollback (animate-pulse-red)
 */
import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, X, Check } from 'lucide-react';
import { usePresenceStore } from '@/store/presenceStore';
import type { Task } from '@/types';

interface TaskCardProps {
  task:       Task;
  onUpdate:   (task: Task, patch: { title?: string; description?: string }) => void;
  onDelete:   (task: Task) => void;
  /** True when CONFLICT_NOTIFY just rolled back this task */
  isConflict?: boolean;
}

export function TaskCard({ task, onUpdate, onDelete, isConflict }: TaskCardProps) {
  const [isEditing,   setIsEditing]   = useState(false);
  const [titleDraft,  setTitleDraft]  = useState(task.title);
  const [descDraft,   setDescDraft]   = useState(task.description);
  const titleRef = useRef<HTMLInputElement>(null);

  // Who else is editing this card?
  const usersDict = usePresenceStore((s) => s.users);
  const editingUsers = Object.values(usersDict).filter(
    (u) => u.editingTaskId === task.id
  );

  // dnd-kit sortable
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.4 : 1,
    zIndex:     isDragging ? 999 : undefined,
  };

  // Focus title input when entering edit mode
  useEffect(() => {
    if (isEditing) titleRef.current?.focus();
  }, [isEditing]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function commitEdit() {
    const trimmedTitle = titleDraft.trim();
    if (!trimmedTitle) {
      setTitleDraft(task.title); // revert empty title
    } else {
      onUpdate(task, {
        title:       trimmedTitle !== task.title       ? trimmedTitle       : undefined,
        description: descDraft   !== task.description  ? descDraft.trim()   : undefined,
      });
    }
    setIsEditing(false);
  }

  function cancelEdit() {
    setTitleDraft(task.title);
    setDescDraft(task.description);
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') cancelEdit();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'group relative rounded-[var(--radius-card)] p-3',
        'bg-[var(--color-bg-card)] border border-[var(--color-border)]',
        'shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]',
        'transition-all duration-[var(--transition-fast)]',
        'cursor-default select-none',
        'animate-fade-in',
        isConflict ? 'animate-pulse-red' : '',
        isDragging  ? 'shadow-[var(--shadow-card-drag)] ring-2 ring-[var(--color-accent-primary)]' : '',
      ].join(' ')}
    >
      {/* Presence rings — users editing this task */}
      {editingUsers.length > 0 && (
        <div className="absolute -top-1.5 -right-1.5 flex -space-x-1">
          {editingUsers.map((u) => (
            <div
              key={u.userId}
              title={`${u.displayName} is editing`}
              className="w-5 h-5 rounded-full border-2 border-[var(--color-bg-card)] ring-1 ring-white/20"
              style={{ backgroundColor: u.color }}
            />
          ))}
        </div>
      )}

      {/* Header row: drag handle + actions */}
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          className="mt-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] cursor-grab active:cursor-grabbing flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          {...attributes}
          {...listeners}
          tabIndex={-1}
          aria-label="Drag task"
        >
          <GripVertical size={14} />
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={titleRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full text-sm font-medium bg-transparent border-b border-[var(--color-accent-primary)] outline-none text-[var(--color-text-primary)] pb-0.5"
              aria-label="Edit task title"
            />
          ) : (
            <p
              className="text-sm font-medium text-[var(--color-text-primary)] leading-snug truncate"
              onDoubleClick={() => setIsEditing(true)}
            >
              {task.title}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {isEditing ? (
            <>
              <button
                onClick={commitEdit}
                className="p-0.5 rounded text-[var(--color-success)] hover:bg-[var(--color-bg-secondary)]"
                aria-label="Save"
              >
                <Check size={13} />
              </button>
              <button
                onClick={cancelEdit}
                className="p-0.5 rounded text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)]"
                aria-label="Cancel"
              >
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-0.5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-bg-secondary)]"
                aria-label="Edit task"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDelete(task)}
                className="p-0.5 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-secondary)]"
                aria-label="Delete task"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {(task.description || isEditing) && (
        <div className="mt-2 pl-5">
          {isEditing ? (
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
              rows={2}
              placeholder="Add description…"
              className="w-full text-xs bg-transparent outline-none resize-none text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-tertiary)] border-b border-[var(--color-border)]"
              aria-label="Edit task description"
            />
          ) : (
            <p
              className="text-xs text-[var(--color-text-secondary)] leading-relaxed line-clamp-2 cursor-text"
              onDoubleClick={() => setIsEditing(true)}
            >
              {task.description}
            </p>
          )}
        </div>
      )}

      {/* Version badge (dev aid) */}
      <div className="mt-2 pl-5 flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
          v{task.version}
        </span>
      </div>
    </div>
  );
}
