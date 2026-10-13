import { useEffect, useState } from 'react';
import './planning-progress.css';

function calculateProgress(tasks, progressLimit) {
  if (!progressLimit) return 0;

  const completedWeight = tasks.reduce(
    (total, task) => total + (task.completed ? Number(task.weight) : 0),
    0,
  );

  return Math.min(100, (completedWeight / progressLimit) * 100);
}

export function PlanningProgress({
  assignmentId,
  tasks: initialTasks,
  progressLimit = 100,
  socket,
  localOnly = false,
  readOnly = false,
  onNotification,
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [error, setError] = useState('');
  const progress = calculateProgress(tasks, progressLimit);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    if (!socket || !readOnly) return undefined;

    const handleProgressUpdate = (update) => {
      if (update.assignmentId !== assignmentId) return;

      setTasks((currentTasks) => currentTasks.map((task) => (
        task.progressId === update.progressId
          ? { ...task, completed: update.completed }
          : task
      )));
      onNotification?.(update);
    };

    socket.on('progress:updated', handleProgressUpdate);
    return () => socket.off('progress:updated', handleProgressUpdate);
  }, [assignmentId, onNotification, readOnly, socket]);

  const toggleTask = (task, completed) => {
    if (localOnly) {
      setTasks((currentTasks) => currentTasks.map((item) => (
        item.progressId === task.progressId ? { ...item, completed } : item
      )));
      return;
    }

    if (!socket || pendingIds.has(task.progressId)) return;

    setError('');
    setPendingIds((current) => new Set(current).add(task.progressId));
    setTasks((currentTasks) => currentTasks.map((item) => (
      item.progressId === task.progressId ? { ...item, completed } : item
    )));

    socket.timeout(10000).emit('task:toggle', {
      progressId: task.progressId,
      completed,
    }, (transportError, result) => {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(task.progressId);
        return next;
      });

      if (transportError || !result?.ok) {
        setTasks((currentTasks) => currentTasks.map((item) => (
          item.progressId === task.progressId
            ? { ...item, completed: task.completed }
            : item
        )));
        setError(result?.error ?? 'A atualização não foi confirmada. Tente novamente.');
      }
    });
  };

  return (
    <section className="planning-progress" aria-label="Progresso do planejamento">
      <div className="planning-progress__summary">
        <span>Progresso</span>
        <strong>{progress.toFixed(0)}%</strong>
      </div>
      <div
        className="planning-progress__track"
        role="progressbar"
        aria-label="Progresso das tarefas concluídas"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="planning-progress__value"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ul className="planning-progress__tasks">
        {tasks.map((task) => (
          <li key={task.progressId}>
            <label className="planning-progress__task">
              <input
                type="checkbox"
                checked={task.completed}
                disabled={readOnly || pendingIds.has(task.progressId)}
                onChange={(event) => toggleTask(task, event.target.checked)}
              />
              <span>{task.title}</span>
              <small>{task.weight}%</small>
            </label>
          </li>
        ))}
      </ul>

      <p className="planning-progress__error" role="alert">{error}</p>
    </section>
  );
}