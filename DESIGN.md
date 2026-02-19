# DESIGN.md — FlowBoard Architecture & Design Decisions

## 1. Conflict Resolution Strategy

### 1.1 Concurrent Move + Edit (Both Changes Must Survive)

**Scenario:** User A moves Task X to "Done". User B edits Task X's title. Both operations arrive at the server within milliseconds.

**Strategy: Field-Level Last-Write-Wins**

The server treats `columnId/order` (position fields) and `title/description` (content fields) as independent namespaces. A `TASK_MOVE` event touches only position fields; a `TASK_UPDATE` event touches only content fields. The server merges them atomically:

```
finalTask = { ...currentState, ...movePayload, ...editPayload }
```

Since neither operation conflicts at the field level, both are applied and broadcast. No data loss occurs. The merged result is written atomically to PostgreSQL using a single `UPDATE` with all changed fields.

**Trade-off:** This works cleanly because the fields are orthogonal. If both operations modified the same field (e.g., both changed the title), we'd fall back to server-timestamp-wins on that field only.

---

### 1.2 Concurrent Move + Move (Deterministic Winner)

**Scenario:** User A moves Task X to "In Progress". User B moves Task X to "Done". Both arrive at the server nearly simultaneously.

**Strategy: Server-Arrival-Timestamp-Wins**

The server processes WebSocket events sequentially on a per-task lock (using a Redis-based mutex keyed on `taskId`). The first `TASK_MOVE` that acquires the lock wins and is applied. The second operation receives a `CONFLICT_NOTIFY` response:

```typescript
{
  type: 'CONFLICT_NOTIFY',
  payload: {
    taskId: string,
    winnerUserId: string,
    loserUserId: string,
    resolvedState: Task,       // the final authoritative task state
    yourAction: 'TASK_MOVE',
    message: 'Another user moved this task first. Your action was not applied.'
  }
}
```

The losing client's optimistic UI update is rolled back by replacing its local task state with `resolvedState`. A toast notification explains what happened.

**Trade-off:** Server-arrival order is a simple, predictable rule. Alternatives like vector clocks or CRDTs would allow more "fairness" but add significant implementation complexity. For a Kanban board, user-facing clarity ("someone else moved it first") is more valuable than complex merge logic.

---

### 1.3 Concurrent Reorder + Insert (Consistent Final Order)

**Scenario:** User A reorders tasks in "To Do". User B adds a new task to "To Do" at the same moment.

**Strategy: Fractional Indexing**

Every task has a floating-point `order` field. Tasks are sorted by this field ascending. Insertion between two tasks uses the midpoint:

```typescript
function orderBetween(prev: number | null, next: number | null): number {
  const lo = prev ?? 0;
  const hi = next ?? lo + 1;
  return (lo + hi) / 2;
}
```

This means:
- A new task inserted at the top gets `order = existing_min / 2`
- A new task inserted at the bottom gets `order = existing_max + 1`
- A task moved between two tasks gets `order = (task_above.order + task_below.order) / 2`

**O(1) per operation**: No other tasks change their `order` value. All clients sort by `order` and converge to the same visual sequence regardless of insertion order.

**Rebalancing**: When the gap between adjacent orders falls below `Number.EPSILON` (~2.2e-16), a rebalance job is triggered via BullMQ to reassign orders as integers `1000, 2000, 3000...` with gaps. This is extremely rare in practice.

---

## 2. Ordering Algorithm

We use **fractional indexing** (also used by Figma, Linear, and Notion) rather than:

- **Array indices (O(n))**: Every move requires updating n tasks — unacceptable at scale
- **Linked lists**: Require two pointer updates per move; harder to query sorted
- **Integers with gaps**: Simple but require periodic rebalancing more frequently

Fractional indexing gives us O(1) writes and O(n log n) reads (sort), which is the optimal trade-off for read-heavy Kanban boards.

---

## 3. Write-Around Cache (Redis)

### Why Redis?

Direct DB writes on every drag event would generate high write traffic. With dnd-kit, a user can fire 10+ position-update events per second during a drag. Writing all of these to PostgreSQL is wasteful.

### Strategy: Write-Around Cache

```
Client WS event
     │
     ▼
Redis (authoritative in-flight state, TTL 1h)
     │
     ├─── Broadcast updated state to all WS clients immediately
     │
     └─── Enqueue BullMQ job (debounced 500ms per task)
               │
               ▼
         PostgreSQL (durable write)
```

**In-flight state** lives in Redis. When a task is moved, Redis is updated immediately and the event is broadcast. BullMQ deduplicates writes — if Task X is moved 10 times in 500ms, only the final position is written to PostgreSQL.

**On server restart**: Redis may be empty. The server loads the board from PostgreSQL as the source of truth. If Redis is also lost, we fall back to PostgreSQL only (no cache-miss impact on correctness).

**Trade-off**: There is a 500ms window where a crash could lose the last position update. This is acceptable for a Kanban board. For financial data, we'd use synchronous DB writes.

---

## 4. WebSocket Architecture

The WS handler is a thin router — it only parses event type and delegates:

```typescript
// ws/router.ts — routing ONLY
socket.on('message', (raw: string) => {
  const event = parseEvent(raw);           // Zod validation
  const handler = eventHandlers[event.type]; // lookup
  if (!handler) return socket.emit('ERROR', { code: 'UNKNOWN_EVENT' });
  handler(socket, event.payload, io);       // delegate to service
});
```

Business logic lives in `services/`. This separation makes unit testing straightforward — services are plain functions, no socket coupling.

---

## 5. Optimistic UI

The client applies mutations immediately to local Zustand state, then sends the WS event. If the server returns a `CONFLICT_NOTIFY`, the client rolls back:

```typescript
// Optimistic apply
boardStore.applyOptimistic(op);

// Send to server
socket.emit(op.type, op.payload);

// Rollback handler
socket.on('CONFLICT_NOTIFY', ({ resolvedState }) => {
  boardStore.rollback(resolvedState);
  toast.error('Conflict resolved — another user was faster');
});
```

This keeps the UI snappy even under network latency while maintaining correctness.

---

## 6. Offline Queue

```typescript
// useOfflineQueue.ts
const queue: QueuedOp[] = [];

socket.on('disconnect', () => {
  setOfflineMode(true);   // shows banner, queues instead of emitting
});

socket.on('connect', () => {
  setOfflineMode(false);
  if (queue.length > 0) {
    socket.emit('REPLAY_OPS', queue);
    queue.length = 0;
  }
});
```

The server processes `REPLAY_OPS` sequentially, applying the same conflict resolution logic as live ops. Each op in the queue carries a `clientTimestamp` so the server can determine relative ordering against ops that happened while the client was offline.

---

## 7. Trade-offs Summary

| Decision | Chosen | Alternative | Reason |
|----------|--------|-------------|--------|
| Conflict strategy | Server-timestamp-wins | CRDTs | Simpler, more predictable UX |
| Ordering | Fractional index | Integer gaps | O(1) writes, no frequent rebalancing |
| Cache | Redis write-around | Synchronous DB | Reduce DB write amplification |
| State management | Zustand + React Query | Redux Toolkit | Less boilerplate, simpler optimistic updates |
| WS library | socket.io | raw ws | Auto-reconnect, rooms, namespaces built-in |
| Offline storage | In-memory queue | IndexedDB | Sufficient for task; survives tab refresh via sessionStorage |