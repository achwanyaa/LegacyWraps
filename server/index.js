// Local dev server: the same Express API as Vercel, plus Vite with HMR on one port.
import path from 'node:path';
import express from 'express';
import { ROOT } from './env.js';
import { app } from './app.js';

const prod = process.argv.includes('--prod');
const port = Number(process.env.PORT) || 5180;

if (prod) {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`\n  Legacy Wraps  http://localhost:${port}`);
  console.log(`  Studio        http://localhost:${port}/studio`);
  console.log(`  Admin         http://localhost:${port}/admin\n`);
});
