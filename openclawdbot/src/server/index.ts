import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import {
  createServer,
  getServerPort,
  Context as buildDevvitContext,
  setContext,
} from '@devvit/web/server';
import { api } from './routes/api';
import { forms } from './routes/forms';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { milestoneIngest, milestoneFeed } from './routes/milestones';
import { demandApi, demandIngest } from './routes/demand';
import { schedulerRoutes } from './routes/scheduler';
import {
  requireInteractiveUser,
  requireLifecycleContext,
} from './middleware/internal-auth';

type HeaderValue = string | string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;
type DevvitContext = ReturnType<typeof buildDevvitContext>;

function normalizeHeaderValues(value: HeaderValue): string[] {
  if (Array.isArray(value)) return value.filter((item) => item.length > 0);
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function buildMetadata(headers: HeaderMap) {
  const metadata: Record<string, { values: string[] }> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!key.startsWith('devvit-')) continue;
    const values = normalizeHeaderValues(value);
    if (values.length === 0) continue;
    metadata[key] = { values };
  }
  return metadata;
}

function buildFallbackContext(headers: HeaderMap): DevvitContext {
  const metadata = buildMetadata(headers);
  const appSlug = metadata['devvit-app']?.values[0];
  const subredditId = metadata['devvit-subreddit']?.values[0];
  const subredditName = metadata['devvit-subreddit-name']?.values[0];

  const fallbackContext = {
    appAccountId: metadata['devvit-app-user']?.values[0] ?? '',
    appName: appSlug,
    appSlug,
    appVersion: metadata['devvit-version']?.values[0],
    subredditId,
    subredditName,
    userId: metadata['devvit-user']?.values[0],
    postId: metadata['devvit-post']?.values[0],
    postData: undefined,
    commentId: metadata['devvit-comment']?.values[0],
    snoovatar: metadata['devvit-user-snoovatar-url']?.values[0],
    username: metadata['devvit-user-name']?.values[0],
    debug: { metadata },
    metadata,
    toJSON() {
      return {
        appAccountId: metadata['devvit-app-user']?.values[0] ?? '',
        appName: appSlug,
        appSlug,
        appVersion: metadata['devvit-version']?.values[0],
        subredditId,
        subredditName,
        userId: metadata['devvit-user']?.values[0],
        postId: metadata['devvit-post']?.values[0],
        postData: undefined,
        commentId: metadata['devvit-comment']?.values[0],
        snoovatar: metadata['devvit-user-snoovatar-url']?.values[0],
        username: metadata['devvit-user-name']?.values[0],
        debug: { metadata },
        metadata,
      };
    },
  };

  return fallbackContext as DevvitContext;
}

const defaultContextFactory = buildDevvitContext;
setContext((headers) => {
  try {
    return defaultContextFactory(headers);
  } catch (error) {
    const message = (error as Error).message ?? '';
    const missingContextBoundary =
      message.includes('subreddit is missing from Context') ||
      message.includes('appAccountId is missing from Context');
    if (!missingContextBoundary) {
      throw error;
    }
    // Allow signed ingest/public proof routes to run without client-supplied
    // Devvit headers; HMAC verification remains the ingest gate.
    return buildFallbackContext(headers as HeaderMap);
  }
});

const app = new Hono();
const publicApi = new Hono();
const internal = new Hono();
const protectedMenu = new Hono();
const protectedForms = new Hono();
const protectedTriggers = new Hono();
const protectedScheduler = new Hono();

// Public proof routes are intentionally readable cross-origin so the
// standalone proof surface can be embedded by external frontends.
publicApi.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
);
publicApi.route('/', api);
publicApi.route('/', demandApi);
publicApi.route('/milestones', milestoneFeed);

protectedMenu.use('*', requireInteractiveUser);
protectedMenu.route('/', menu);

protectedForms.use('*', requireInteractiveUser);
protectedForms.route('/', forms);

protectedTriggers.use('*', requireLifecycleContext);
protectedTriggers.route('/', triggers);

protectedScheduler.use('*', requireInteractiveUser);
protectedScheduler.route('/', schedulerRoutes);

internal.route('/menu', protectedMenu);
internal.route('/form', protectedForms);
internal.route('/triggers', protectedTriggers);
internal.route('/milestones', milestoneIngest);
internal.route('/demand', demandIngest);
internal.route('/scheduler', protectedScheduler);

app.route('/api', publicApi);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
