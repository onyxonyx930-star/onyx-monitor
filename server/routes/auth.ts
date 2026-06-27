import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb } from '../database';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'onyx-monitor-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Token de autenticação não fornecido',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string; role: string };
    (req as any).user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Token inválido ou expirado',
    });
  }
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;

  if (!user || user.role !== 'admin') {
    res.status(403).json({
      success: false,
      message: 'Acesso negado. Apenas administradores podem acessar este recurso.',
    });
    return;
  }

  next();
}

router.post('/login', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        success: false,
        message: 'Email e senha são obrigatórios',
      });
    }

    const result = await db.query('SELECT * FROM usuarios WHERE email = $1 AND ativo = 1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas',
      });
    }

    const passwordHash = hashPassword(senha);
    if (passwordHash !== user.senha_hash) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas',
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao realizar login',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = (req as any).user.userId;

    const result = await db.query(
      'SELECT id, nome, email, role, cliente_id, ativo, created_at FROM usuarios WHERE id = $1',
      [userId]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado',
      });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar usuário',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/usuarios', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { nome, email, senha, role, cliente_id } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({
        success: false,
        message: 'Nome, email e senha são obrigatórios',
      });
    }

    const existing = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existing.rows[0]) {
      return res.status(409).json({
        success: false,
        message: 'Já existe um usuário com este email',
      });
    }

    const result = await db.query(
      `INSERT INTO usuarios (nome, email, senha_hash, role, cliente_id, ativo)
       VALUES ($1, $2, $3, $4, $5, 1)
       RETURNING id, nome, email, role, cliente_id, ativo, created_at`,
      [nome, email, hashPassword(senha), role || 'cliente', cliente_id || null]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Usuário criado com sucesso',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao criar usuário',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/usuarios', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDb();

    const result = await db.query('SELECT id, nome, email, role, cliente_id, ativo, created_at FROM usuarios ORDER BY created_at DESC');

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar usuários',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
