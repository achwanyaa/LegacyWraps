import express from 'express';
import { api } from './api.js';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));
app.use('/api', api);
