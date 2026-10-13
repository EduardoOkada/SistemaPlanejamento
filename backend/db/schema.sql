CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  progress_limit NUMERIC(7, 2) NOT NULL DEFAULT 100 CHECK (progress_limit > 0),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  weight NUMERIC(7, 2) NOT NULL CHECK (weight > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, plan_id)
);

CREATE TABLE plan_assignments (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, plan_id),
  UNIQUE (plan_id, user_id)
);

CREATE TABLE task_progress (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL,
  assignment_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (assignment_id, plan_id)
    REFERENCES plan_assignments(id, plan_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id, plan_id)
    REFERENCES tasks(id, plan_id) ON DELETE CASCADE,
  UNIQUE (assignment_id, task_id)
);

CREATE INDEX task_progress_assignment_idx ON task_progress(assignment_id);

CREATE TABLE progress_logs (
  id BIGSERIAL PRIMARY KEY,
  progress_id INTEGER NOT NULL REFERENCES task_progress(id) ON DELETE CASCADE,
  changed_by INTEGER NOT NULL REFERENCES users(id),
  completed BOOLEAN NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX progress_logs_progress_idx ON progress_logs(progress_id, changed_at DESC);