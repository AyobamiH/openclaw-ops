import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api';
import { forms } from './routes/forms';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { milestoneIngest, milestoneFeed } from './routes/milestones';
import { demandApi, demandIngest } from './routes/demand';
import { schedulerRoutes } from './routes/scheduler';

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/form', forms);
internal.route('/triggers', triggers);
internal.route('/milestones', milestoneIngest);
internal.route('/demand', demandIngest);
internal.route('/scheduler', schedulerRoutes);

app.route('/api', api);
app.route('/api', demandApi);
app.route('/api/milestones', milestoneFeed);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
