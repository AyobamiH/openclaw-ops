import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context, scheduler, redis } from '@devvit/web/server';
import { createPost } from '../core/post';
import { FEED_URL_REDIS_KEY } from './scheduler';
import { SIGNING_SECRET_REDIS_KEY } from './forms';

// Default feed configuration — auto-seeded on every install so the app
// works immediately without requiring manual moderator setup.
const DEFAULT_FEED_URL =
  'https://raw.githubusercontent.com/AyobamiH/openclaw-ops/master/orchestrator/data/milestones-feed.json';
const DEFAULT_SIGNING_SECRET =
  '96a9cb3cbfcd8f54ffd3255c5ab526dec5c5acf343eda62751bac5e682ebade3';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createPost();
    const input = await c.req.json<OnAppInstallRequest>();

    // Auto-seed Redis with defaults so polling works immediately after install.
    try {
      const existingUrl = await redis.get(FEED_URL_REDIS_KEY);
      if (!existingUrl) {
        await redis.set(FEED_URL_REDIS_KEY, DEFAULT_FEED_URL);
        console.log('[triggers] feed URL auto-configured');
      }
      const existingSecret = await redis.get(SIGNING_SECRET_REDIS_KEY);
      if (!existingSecret) {
        await redis.set(SIGNING_SECRET_REDIS_KEY, DEFAULT_SIGNING_SECRET);
        console.log('[triggers] signing secret auto-configured');
      }
    } catch (err) {
      console.warn('[triggers] failed to auto-configure Redis:', (err as Error).message);
    }

    // Start the milestone feed poll job (runs every minute)
    try {
      await scheduler.runJob({ name: 'pollMilestoneFeed', cron: '* * * * *' });
      console.log('[triggers] pollMilestoneFeed scheduler job started');
    } catch (err) {
      console.warn('[triggers] failed to start pollMilestoneFeed:', (err as Error).message);
    }

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Post created in subreddit ${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to create post',
      },
      400
    );
  }
});
