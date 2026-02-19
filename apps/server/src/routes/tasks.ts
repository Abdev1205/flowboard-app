/**
 * routes/tasks.ts
 *
 * REST API for tasks — used as an HTTP fallback when websockets are
 * unavailable and as the initial board load endpoint.
 *
 * Routes:
 *   GET  /api/tasks          — fetch all tasks (cold-boot / HTTP fallback)
 *   GET  /api/tasks/:id      — fetch a single task
 *
 * All mutations go through WebSocket — REST is read-only intentionally.
 * This keeps conflict resolution logic in one place (the WS handlers).
 */
import { Router, type Request, type Response } from 'express';
import { getAllTasks, getTaskById } from '../services/taskService';

const router = Router();

// GET /api/tasks
router.get('/', async (_req: Request, res: Response) => {
  try {
    const tasks = await getAllTasks();
    res.json({ ok: true, data: tasks });
  } catch (err) {
    console.error('[GET /api/tasks]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  const id = req.params.id;
  try {
    const task = await getTaskById(id);
    if (!task) {
      res.status(404).json({ ok: false, error: 'Task not found' });
      return;
    }
    res.json({ ok: true, data: task });
  } catch (err) {
    console.error('[GET /api/tasks/:id]', err);
    res.status(500).json({ ok: false, error: 'Failed to fetch task' });
  }
});

export default router;
