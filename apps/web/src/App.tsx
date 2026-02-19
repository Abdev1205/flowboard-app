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
import { useWebSocket } from '@/hooks/useWebSocket';
import { useBoard }     from '@/hooks/useBoard';
import { useBoardStore } from '@/store/boardStore';
import { KanbanBoard }  from '@/components/board/KanbanBoard';
import { PresenceBar }  from '@/components/presence/PresenceBar';
import '@/index.css';

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
  const { emit } = useWebSocket('User');   // displayName: real auth later
  const board    = useBoard(emit as Parameters<typeof useBoard>[0]);
  const isLoaded = useBoardStore((s) => s.isLoaded);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--color-bg-primary)', fontFamily: 'var(--font-body)' }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] flex-shrink-0"
        style={{ boxShadow: '0 1px 0 var(--color-border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--color-accent-primary)] flex items-center justify-center">
            <span className="text-white text-xs font-bold">FB</span>
          </div>
          <span
            className="text-base font-semibold text-[var(--color-text-primary)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            FlowBoard
          </span>
        </div>

        {/* Right: PresenceBar */}
        <PresenceBar />
      </header>

      {/* ── Board area ───────────────────────────────────────────────────── */}
      <main className="flex flex-col flex-1 overflow-hidden">
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
