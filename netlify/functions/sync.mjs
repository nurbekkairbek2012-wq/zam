// Общая копия данных для ноута и телефона (Netlify Blobs)
import { getStore } from '@netlify/blobs';

const PASS = '123456';

export default async (req) => {
  if (req.headers.get('x-pass') !== PASS) return new Response('Неверный пароль', { status: 401 });
  const store = getStore('moy-plan');

  if (req.method === 'GET') {
    const cur = await store.get('state', { type: 'json' });
    return Response.json(cur || {}, { headers: { 'cache-control': 'no-store' } });
  }

  if (req.method === 'POST') {
    const body = await req.json();
    if (!body || typeof body.updatedAt !== 'number' || typeof body.data !== 'object') {
      return new Response('Плохие данные', { status: 400 });
    }
    const cur = await store.get('state', { type: 'json' });
    // на сервере уже более свежая версия с другого устройства — отдаём её
    if (cur && cur.updatedAt > body.updatedAt) return Response.json(cur, { status: 409 });
    await store.setJSON('state', { updatedAt: body.updatedAt, data: body.data });
    return Response.json({ ok: true });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/api/sync' };
