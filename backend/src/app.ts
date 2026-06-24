import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler } from './shared/middleware/error-handler.js';
import authRoutes from './modules/auth/auth.routes.js';
import storiesRoutes from './modules/stories/stories.routes.js';
import mediaRoutes, { coverPublicRouter } from './modules/media/media.routes.js';
import trashRoutes from './modules/trash/trash.routes.js';
import maintenanceRoutes from './modules/maintenance/maintenance.routes.js';
import playlistsRoutes from './modules/playlists/playlists.routes.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stories', storiesRoutes);
app.use('/api/v1', mediaRoutes);
app.use('/api/v1', coverPublicRouter);
app.use('/api/v1/audio-trash', trashRoutes);
app.use('/api/v1/maintenance', maintenanceRoutes);
app.use('/api/v1/playlists', playlistsRoutes);

app.use(errorHandler);
