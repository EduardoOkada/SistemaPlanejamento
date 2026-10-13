import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createServer } from 'node:http';
import pg from 'pg';
import { Server } from 'socket.io';
import { createAuthRouter } from './auth.js';

const { Pool } = pg;
const port = Number(process.env.PORT ?? 3001);
const jwtSecret = process.env.JWT_SECRET;
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

if (!process.env.DATABASE_URL || !jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  throw new Error('Configure DATABASE_URL e um JWT_SECRET com ao menos 32 bytes.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: frontendOrigin, credentials: true },
});

app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use('/api/auth', createAuthRouter({ pool, jwtSecret }));

app.get('/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch {
    response.status(503).json({ status: 'unavailable' });
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const claims = jwt.verify(token, jwtSecret);
    const userId = Number(claims.id);

    if (!Number.isInteger(userId) || !['admin', 'user'].includes(claims.role)) {
      return next(new Error('Credenciais inválidas.'));
    }

    socket.data.user = { id: userId, role: claims.role };
    next();
  } catch {
    next(new Error('Autenticação necessária.'));
  }
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  if (user.role === 'admin') socket.join('admins');

  socket.on('task:toggle', async (payload, acknowledge) => {
    const progressId = Number(payload?.progressId);
    const completed = payload?.completed;

    if (!Number.isInteger(progressId) || typeof completed !== 'boolean') {
      acknowledge?.({ ok: false, error: 'Dados da tarefa inválidos.' });
      return;
    }

    let client;
    let transactionStarted = false;

    try {
      client = await pool.connect();
      await client.query('BEGIN');
      transactionStarted = true;

      const { rows } = await client.query(
        `SELECT tp.id AS "progressId", tp.assignment_id AS "assignmentId",
                tp.completed, t.id AS "taskId", t.title AS "taskTitle",
                u.name AS "userName", p.progress_limit AS "progressLimit"
           FROM task_progress tp
           JOIN plan_assignments pa ON pa.id = tp.assignment_id
           JOIN tasks t ON t.id = tp.task_id
           JOIN plans p ON p.id = tp.plan_id
           JOIN users u ON u.id = pa.user_id
          WHERE tp.id = $1 AND pa.user_id = $2
          FOR UPDATE OF tp`,
        [progressId, user.id],
      );

      if (rows.length === 0) {
        const error = new Error('Tarefa não encontrada para este usuário.');
        error.publicMessage = error.message;
        throw error;
      }

      const task = rows[0];
      await client.query(
        'UPDATE task_progress SET completed = $1, updated_at = NOW() WHERE id = $2',
        [completed, progressId],
      );
      await client.query(
        'INSERT INTO progress_logs (progress_id, changed_by, completed) VALUES ($1, $2, $3)',
        [progressId, user.id, completed],
      );

      const progressResult = await client.query(
        `SELECT LEAST(100, COALESCE(
                  ROUND(SUM(CASE WHEN tp.completed THEN t.weight ELSE 0 END) * 100
                    / NULLIF(p.progress_limit, 0), 2), 0
                )) AS "progressPercent"
           FROM task_progress tp
           JOIN tasks t ON t.id = tp.task_id
           JOIN plans p ON p.id = tp.plan_id
          WHERE tp.assignment_id = $1
          GROUP BY p.progress_limit`,
        [task.assignmentId],
      );

      await client.query('COMMIT');
      transactionStarted = false;

      const update = {
        ok: true,
        progressId,
        taskId: task.taskId,
        assignmentId: task.assignmentId,
        taskTitle: task.taskTitle,
        userName: task.userName,
        completed,
        progressPercent: Number(progressResult.rows[0]?.progressPercent ?? 0),
      };

      io.to('admins').emit('progress:updated', update);
      acknowledge?.(update);
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Falha ao desfazer atualização:', rollbackError);
        }
      }
      acknowledge?.({ ok: false, error: error.publicMessage ?? 'Não foi possível atualizar a tarefa.' });
    } finally {
      client?.release();
    }
  });
});

httpServer.listen(port, () => {
  console.log(`API disponível na porta ${port}`);
});