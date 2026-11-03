import { PrismaClient } from '@prisma/client';
const globalForDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalForDb.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForDb.prisma = db;
export const USER_ID = 'local-learner';
export function parse<T = Record<string, unknown>>(value: string | null | undefined, fallback: T): T {
  try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}
