import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'onyx-monitor-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function signToken(user: { userId: number; email: string; role: string }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { userId: number; email: string; role: string };
}

export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    const result = await query('SELECT id, nome, email, role, cliente_id, ativo FROM usuarios WHERE id = $1 AND ativo = 1', [decoded.userId]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request): Promise<{ user: any; error?: Response }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: Response.json({ success: false, message: 'Token de autenticação não fornecido' }, { status: 401 }) };
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    const result = await query('SELECT id, nome, email, role, cliente_id, ativo FROM usuarios WHERE id = $1 AND ativo = 1', [decoded.userId]);
    if (!result.rows[0]) {
      return { user: null, error: Response.json({ success: false, message: 'Usuário não encontrado' }, { status: 401 }) };
    }
    return { user: result.rows[0] };
  } catch {
    return { user: null, error: Response.json({ success: false, message: 'Token inválido ou expirado' }, { status: 401 }) };
  }
}

export async function requireAdmin(req: Request): Promise<{ user: any; error?: Response }> {
  const { user, error } = await requireAuth(req);
  if (error) return { user: null, error };
  if (user.role !== 'admin') {
    return { user: null, error: Response.json({ success: false, message: 'Acesso negado. Apenas administradores.' }, { status: 403 }) };
  }
  return { user };
}
