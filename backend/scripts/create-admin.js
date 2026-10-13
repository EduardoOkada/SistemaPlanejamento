import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const { DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!DATABASE_URL || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('Configure DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD no ambiente.');
}

if (
  ADMIN_NAME.trim().length < 2 || ADMIN_NAME.trim().length > 120
  || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL.trim())
  || ADMIN_PASSWORD.length < 12 || Buffer.byteLength(ADMIN_PASSWORD, 'utf8') > 72
) {
  throw new Error('Informe nome e e-mail válidos e senha com 12 a 72 bytes.');
}

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, role, password_hash)
     VALUES ($1, $2, 'admin', $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [ADMIN_NAME.trim(), ADMIN_EMAIL.trim().toLowerCase(), passwordHash],
  );

  if (!rows[0]) {
    throw new Error('Este e-mail já existe; o administrador não foi alterado.');
  }

  console.log(`Administrador criado com id ${rows[0].id}.`);
} finally {
  await pool.end();
}