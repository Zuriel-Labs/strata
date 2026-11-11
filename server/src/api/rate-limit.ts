import type Database from 'better-sqlite3';
import type { Request, Response, NextFunction } from 'express';
import { digest } from './credentials';

export function consumeRate(db: Database.Database, bucket: string, limit: number, seconds = 60) {
  const now = Date.now();
  return db.transaction(() => {
    db.prepare('DELETE FROM api_rate_windows WHERE resets_at <= ?').run(now);
    const bucketHash = digest(bucket);
    const current = db.prepare('SELECT count, resets_at FROM api_rate_windows WHERE bucket_hash = ?').get(bucketHash) as { count: number; resets_at: number } | undefined;
    if (!current && Number(db.prepare('SELECT COUNT(*) FROM api_rate_windows').pluck().get()) >= 10000) return seconds;
    if (current && current.count >= limit) return Math.max(1, Math.ceil((current.resets_at - now) / 1000));
    db.prepare('INSERT INTO api_rate_windows VALUES (?, 1, ?) ON CONFLICT(bucket_hash) DO UPDATE SET count = count + 1').run(bucketHash, now + seconds * 1000);
    return 0;
  }).immediate();
}
export function rateLimit(db: Database.Database, bucket: string, limit: number, seconds = 60) {
  return (request: Request, response: Response, next: NextFunction) => {
    const retry = consumeRate(db, `${bucket}:${request.ip}`, limit, seconds);
    if (retry) { response.set('Retry-After', String(retry)).status(429).json({ code: 'RATE_LIMITED', error: 'slow_down', message: 'Too many requests. Wait before retrying.' }); return; }
    next();
  };
}
export function requireTls(request: Request, response: Response, next: NextFunction) {
  const local = ['development', 'test'].includes(process.env.NODE_ENV ?? 'development') && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '');
  if (!request.secure && !local) { response.status(400).json({ code: 'TLS_REQUIRED', message: 'HTTPS is required.' }); return; }
  response.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer' });
  next();
}
