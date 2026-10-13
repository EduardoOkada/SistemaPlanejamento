import bcrypt from 'bcryptjs';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createToken(user, jwtSecret) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    jwtSecret,
    { expiresIn: '8h' },
  );
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function createAuthRouter({ pool, jwtSecret }) {
  const router = express.Router();

  router.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  router.post('/register', async (request, response) => {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    const email = typeof request.body?.email === 'string'
      ? request.body.email.trim().toLowerCase()
      : '';
    const password = request.body?.password;

    if (
      name.length < 2 || name.length > 120
      || email.length > 254 || !emailPattern.test(email)
      || typeof password !== 'string' || password.length < 12
      || Buffer.byteLength(password, 'utf8') > 72
    ) {
      response.status(400).json({ error: 'Informe nome, e-mail válido e senha entre 12 e 72 bytes.' });
      return;
    }

    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, role, password_hash)
         VALUES ($1, $2, 'user', $3)
         RETURNING id, name, email, role`,
        [name, email, passwordHash],
      );
      const user = rows[0];

      response.status(201).json({ token: createToken(user, jwtSecret), user: publicUser(user) });
    } catch (error) {
      if (error.code === '23505') {
        response.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
        return;
      }

      console.error('Falha no cadastro:', error);
      response.status(500).json({ error: 'Não foi possível criar a conta.' });
    }
  });

  router.post('/login', async (request, response) => {
    const email = typeof request.body?.email === 'string'
      ? request.body.email.trim().toLowerCase()
      : '';
    const password = request.body?.password;

    if (!emailPattern.test(email) || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) {
      response.status(401).json({ error: 'E-mail ou senha inválidos.' });
      return;
    }

    try {
      const { rows } = await pool.query(
        'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
        [email],
      );
      const user = rows[0];
      const passwordMatches = user?.password_hash
        ? await bcrypt.compare(password, user.password_hash)
        : false;

      if (!passwordMatches) {
        response.status(401).json({ error: 'E-mail ou senha inválidos.' });
        return;
      }

      response.json({ token: createToken(user, jwtSecret), user: publicUser(user) });
    } catch (error) {
      console.error('Falha no login:', error);
      response.status(500).json({ error: 'Não foi possível entrar no sistema.' });
    }
  });

  router.get('/me', async (request, response) => {
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');

    if (scheme !== 'Bearer' || !token) {
      response.status(401).json({ error: 'Autenticação necessária.' });
      return;
    }

    try {
      const claims = jwt.verify(token, jwtSecret);
      const { rows } = await pool.query(
        'SELECT id, name, email, role FROM users WHERE id = $1',
        [claims.id],
      );

      if (!rows[0]) {
        response.status(401).json({ error: 'Sessão inválida.' });
        return;
      }

      response.json({ user: publicUser(rows[0]) });
    } catch {
      response.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }
  });

  return router;
}