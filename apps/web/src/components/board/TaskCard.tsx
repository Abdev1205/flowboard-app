
/**
 * components/board/TaskCard.tsx
 *
 * Individual task card shown inside a Column.
 *
 * Features:
 *   - dnd-kit useSortable for drag handle
 *   - Inline editing for title and description (double-click)
 *   - Presence: "User is editing..." pill when active
 *   - Delete button on hover
 *   - Visual conflict flash on rollback (animate-pulse-red)
 */
import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, Trash2, X, Check } from 'lucide-react';
import { usePresenceStore } from '@/store/presenceStore';
import type { Task } from '@/types';

interface TaskCardProps {
  task:       Task;
  onUpdate:   (task: Task, patch: { title?: string; description?: string }) => void;
  onDelete:   (task: Task) => void;
  /** True when CONFLICT_NOTIFY just rolled back this task */
  isConflict?: boolean;
  /** True when rendered in DragOverlay */
  isOverlay?: boolean;
}

const COLUMN_COLORS: Record<string, string> = {
  'todo': 'var(--color-todo)',
  'in-progress': 'var(--color-inprogress)',
  'done': 'var(--color-done)',
};

// Helper for relative time (simple implementation)
function getRelativeTime(iso: string) {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

export function TaskCard({ task, onUpdate, onDelete, isConflict, isOverlay }: TaskCardProps) {
  const [isEditing,   setIsEditing]   = useState(false);
  const [titleDraft,  setTitleDraft]  = useState(task.title);
  const [descDraft,   setDescDraft]   = useState(task.description);
  const titleRef = useRef<HTMLInputElement>(null);

  // Who else is editing this card?
  const usersDict = usePresenceStore((s) => s.users);
  const editingUsers = Object.values(usersDict).filter(
    (u) => u.editingTaskId === task.id
  );

  // Active editor (first one wins for UI display)
  const activeEditor = editingUsers[0];
  const isDone = task.columnId === 'done';

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
    // If dragging in overlay, don't apply transform (wrapper handles it)
    transform:  isOverlay ? undefined : CSS.Transform.toString(transform),
    transition: isOverlay ? undefined : transition,
    // Overlay is opaque (or close to it), original is heavily dimmed
    opacity:    isOverlay ? 1 : (isDragging ? 0.3 : 1),
    zIndex:     isDragging ? 999 : undefined,
    borderLeftColor: activeEditor ? activeEditor.color : 'transparent',
    borderLeftWidth: activeEditor ? '4px' : '0px',
    backgroundColor: isOverlay ? `color-mix(in srgb, ${COLUMN_COLORS[task.columnId]}, white 90%)` : undefined,
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
        'group relative rounded-r-lg rounded-l-[4px] p-3',
        isOverlay 
          ? 'shadow-[var(--shadow-card-drag)] ring-2 ring-[var(--color-accent-primary)] cursor-grabbing' // Overlay style
          : 'bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing', // Normal style
        'transition-all duration-[var(--transition-fast)]',
        'select-none',
        'animate-fade-in',
        isConflict ? 'animate-pulse-red' : '',
        isDone ? 'opacity-60' : '', // Faded if done
      ].join(' ')}
      // Don't attach listeners to the overlay clone
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
    >
      {/* Editing Pill (instead of rings) if someone is actively editing */}
      {activeEditor && (
        <div 
          className="mb-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium animate-pulse"
          style={{ backgroundColor: `${activeEditor.color}20`, color: activeEditor.color }}
        >
          <div className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: activeEditor.color }} />
          {activeEditor.displayName} is editing...
        </div>
      )}

      {/* Header row: title + actions */}
      <div className="flex items-start gap-2">
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
              // Prevent drag when interacting with input
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <p
              className={`text-sm font-medium text-[var(--color-text-primary)] leading-snug truncate ${isDone ? 'line-through decoration-[var(--color-text-tertiary)] text-[var(--color-text-secondary)]' : ''}`}
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
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag
                className="p-1.5 rounded cursor-pointer text-[var(--color-success)] hover:bg-[var(--color-bg-secondary)]"
                aria-label="Save"
              >
                <Check size={14} />
              </button>
              <button
                onClick={cancelEdit}
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag
                className="p-1.5 rounded cursor-pointer text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)]"
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag
                className="p-1.5 rounded cursor-pointer text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-bg-secondary)]"
                aria-label="Edit task"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDelete(task)}
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag
                className="p-1.5 rounded cursor-pointer text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-secondary)]"
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
        <div className="mt-2 pl-0">
          {isEditing ? (
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
              rows={2}
              placeholder="Add description…"
              className="w-full text-xs bg-transparent outline-none resize-none text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-tertiary)] border-b border-[var(--color-border)]"
              aria-label="Edit task description"
              onPointerDown={(e) => e.stopPropagation()} // Prevent drag
            />
          ) : (
            <p
              className={`text-xs text-[var(--color-text-secondary)] leading-relaxed line-clamp-2 cursor-text ${isDone ? 'line-through decoration-[var(--color-text-tertiary)] opacity-80' : ''}`}
              onDoubleClick={() => setIsEditing(true)}
            >
              {task.description}
            </p>
          )}
        </div>
      )}

      {/* Footer: User Avatar + Time */}
      <div className="mt-3 pl-0 flex items-center justify-between">
         <div className="flex items-center gap-2">
            {!isDone && (
              <div className="w-5 h-5 rounded-full bg-[var(--color-brand-100)] flex items-center justify-center text-[9px] font-bold text-[var(--color-brand-700)]">
                 A
              </div>
            )}
            <span className="text-[10px] text-[var(--color-text-tertiary)] font-medium">
              {getRelativeTime(task.updatedAt || task.createdAt)}
            </span>
         </div>
      </div>
    </div>
  );
}
