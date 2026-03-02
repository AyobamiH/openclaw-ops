import type { MiddlewareHandler } from 'hono';
import { context } from '@devvit/web/server';

function hasAppContext(): boolean {
  return (
    typeof context.appSlug === 'string' &&
    context.appSlug.trim().length > 0 &&
    typeof context.subredditName === 'string' &&
    context.subredditName.trim().length > 0 &&
    typeof context.subredditId === 'string' &&
    context.subredditId.trim().length > 0
  );
}

export const requireInteractiveUser: MiddlewareHandler = async (c, next) => {
  if (!hasAppContext()) {
    return c.json({ error: 'Devvit app context required' }, 401);
  }

  if (!context.userId) {
    return c.json({ error: 'Interactive user context required' }, 403);
  }

  await next();
};

export const requireLifecycleContext: MiddlewareHandler = async (c, next) => {
  if (!hasAppContext()) {
    return c.json({ error: 'Devvit app context required' }, 401);
  }

  if (context.userId) {
    return c.json({ error: 'Lifecycle routes reject interactive user context' }, 403);
  }

  await next();
};
