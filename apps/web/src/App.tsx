/**
 * App.tsx — FlowBoard root component
 *
 * Responsibilities:
 *   1. Mount the WebSocket connection
 *   2. Provide board actions (from useBoard) to KanbanBoard
 *   3. Render the top bar (logo + PresenceBar)
 *   4. Render the Sonner Toaster for conflict notifications
 *   5. Show a loading skeleton until BOARD_SNAPSHOT arrives
 */
import { Toaster } from 'sonner';
import { useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useBoard }     from '@/hooks/useBoard';
import { useBoardStore } from '@/store/boardStore';
import { KanbanBoard }  from '@/components/board/KanbanBoard';
import { PresenceBar }  from '@/components/presence/PresenceBar';
import '@/index.css';
import { Grid2X2, Plus } from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

// ── Board loading skeleton ─────────────────────────────────────────────────────

function BoardSkeleton() {
  return (
    <div className="flex gap-6 p-6 overflow-x-auto flex-1 items-start">
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-72 flex-shrink-0">
          {/* Column header skeleton */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-border)] animate-pulse" />
            <div className="h-4 w-24 rounded bg-[var(--color-border)] animate-pulse" />
          </div>
          {/* Card skeletons */}
          <div className="flex flex-col gap-2 rounded-xl p-2 bg-[var(--color-bg-secondary)] min-h-[120px]">
            {Array.from({ length: i === 0 ? 3 : i === 1 ? 2 : 1 }).map((_, j) => (
              <div
                key={j}
                className="rounded-[var(--radius-card)] p-3 bg-[var(--color-bg-card)] border border-[var(--color-border)]"
              >
                <div className="h-3 w-3/4 rounded bg-[var(--color-border)] animate-pulse mb-2" />
                <div className="h-2 w-1/2 rounded bg-[var(--color-border-strong)] animate-pulse opacity-50" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────

function App() {
  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem('flowboard:displayName') || 'User';
  });

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const { emit } = useWebSocket(displayName);   // Reconnects on name change
  const board    = useBoard(emit as Parameters<typeof useBoard>[0]);
  const isLoaded = useBoardStore((s) => s.isLoaded);

  function handleNameSave() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== displayName) {
      setDisplayName(trimmed);
      localStorage.setItem('flowboard:displayName', trimmed);
    }
    setIsEditingName(false);
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--color-bg-primary)', fontFamily: 'var(--font-body)' }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header
        className="relative flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] flex-shrink-0"
        style={{ boxShadow: '0 1px 0 var(--color-border)' }}
      >
        {/* Left: Logo + User Greeting */}
        <div className="flex items-center gap-5">
          {/* Logo (Icon Layout) */}
          <div className="flex items-center gap-3 select-none">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-brand-600)] flex items-center justify-center shadow-sm ring-1 ring-black/5">
              <Grid2X2 className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span
              className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              FlowBoard
            </span>
          </div>

          {/* Vertical Divider */}
          <div className="h-5 w-px bg-[var(--color-border)]" />

          {/* User Greeting */}
          <div className="flex items-center gap-2" title="Click name to edit">
            {/* Small Avatar */}
            <div className="w-6 h-6 rounded-full bg-[var(--color-brand-100)] text-[var(--color-brand-700)] flex items-center justify-center ring-1 ring-[var(--color-brand-200)]">
              <span className="text-[10px] font-bold">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>

            {isEditingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                className="text-sm font-medium text-[var(--color-text-primary)] bg-transparent border-b border-[var(--color-brand-500)] outline-none min-w-[80px] p-0 leading-none"
              />
            ) : (
              <button
                onClick={() => {
                  setNameDraft(displayName);
                  setIsEditingName(true);
                }}
                className="text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors decoration-[var(--color-border-strong)] hover:decoration-[var(--color-text-tertiary)] underline underline-offset-4 decoration-dashed"
              >
                Hi, {displayName}
              </button>
            )}
          </div>
        </div>

        {/* Center: Board Title */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block pointer-events-none select-none">
          <span className="text-sm font-semibold text-[var(--color-text-secondary)] tracking-tight">
            Q1 Sprint — Engineering
          </span>
        </div>

        {/* Right: PresenceBar + Action */}
        <div className="flex items-center gap-4">
          <PresenceBar />
          
          <button 
            className="flex items-center gap-1.5 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer"
            onClick={() => {
              // TODO: Implement global create task modal or focus first column
              console.log('New Task clicked');
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>New Task</span>
          </button>
        </div>
      </header>

      {/* ── Board area ───────────────────────────────────────────────────── */}
      <main className="flex flex-col flex-1 overflow-hidden">
        <ErrorBoundary>
          {isLoaded ? (
            <KanbanBoard
              onCreateTask={board.createTask}
              onUpdateTask={board.updateTask}
              onMoveTask={board.moveTask}
              onDeleteTask={board.deleteTask}
            />
          ) : (
            <BoardSkeleton />
          )}
        </ErrorBoundary>
      </main>

      {/* ── Toaster for conflict notifications ───────────────────────────── */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast:       'font-[var(--font-body)] text-sm',
            description: 'text-[var(--color-text-secondary)] text-xs',
          },
        }}
      />
    </div>
  );
}

export default App;
