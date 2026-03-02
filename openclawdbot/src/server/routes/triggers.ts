import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnAppUpgradeRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { context, scheduler, redis, reddit } from '@devvit/web/server';
import { createPost } from '../core/post';
import {
  buildInitialWikiFeed,
  DEFAULT_FEED_URL,
  isLegacyStartupOnlyFeed,
  MILESTONE_WIKI_PAGE,
  parseRemoteFeedText,
} from '../core/milestone-pipeline';
import { FEED_URL_REDIS_KEY, runPoll } from './scheduler';
import { SIGNING_SECRET_REDIS_KEY } from './forms';

export const triggers = new Hono();

async function ensureDefaults(): Promise<void> {
  try {
    const existingUrl = await redis.get(FEED_URL_REDIS_KEY);
    if (!existingUrl) {
      await redis.set(FEED_URL_REDIS_KEY, DEFAULT_FEED_URL);
      console.log('[triggers] feed URL auto-configured');
    }
  } catch (err) {
    console.warn(
      '[triggers] failed to auto-configure Redis:',
      (err as Error).message
    );
  }
}

async function ensureWikiSeeded(): Promise<void> {
  try {
    const existingPage = await reddit.getWikiPage(
      context.subredditName,
      MILESTONE_WIKI_PAGE
    );

    const parsed = existingPage.content
      ? parseRemoteFeedText(existingPage.content)
      : null;

    if (parsed && !isLegacyStartupOnlyFeed(parsed)) {
      console.log('[triggers] milestones wiki page already healthy');
      return;
    }

    if (parsed && isLegacyStartupOnlyFeed(parsed)) {
      console.log(
        '[triggers] legacy startup-only milestone seed detected, refreshing'
      );
    }
  } catch (err) {
    console.warn(
      '[triggers] wiki page missing or unreadable, reseeding:',
      (err as Error).message
    );
  }

  try {
    const signingSecret = await redis.get(SIGNING_SECRET_REDIS_KEY);
    if (
      typeof signingSecret !== 'string' ||
      signingSecret.trim().length === 0
    ) {
      console.warn(
        '[triggers] signing secret not configured, skipping wiki seed'
      );
      return;
    }

    await reddit.updateWikiPage({
      subredditName: context.subredditName,
      page: MILESTONE_WIKI_PAGE,
      content: buildInitialWikiFeed(signingSecret.trim()),
      reason: 'Initialized by openclawdbot',
    });
    console.log('[triggers] milestones wiki page seeded');
  } catch (err) {
    console.warn(
      '[triggers] failed to seed wiki page:',
      (err as Error).message
    );
  }
}

async function ensureSchedulerRunning(): Promise<void> {
  try {
    await scheduler.runJob({ name: 'pollMilestoneFeed', cron: '* * * * *' });
    console.log('[triggers] pollMilestoneFeed scheduler job started');
  } catch (err) {
    console.warn(
      '[triggers] failed to start pollMilestoneFeed:',
      (err as Error).message
    );
  }
}

/** Shared setup: preserve defaults, seed wiki only when needed, start scheduler, warm feed now. */
async function initWikiAndScheduler(): Promise<void> {
  await ensureDefaults();
  await ensureWikiSeeded();
  await ensureSchedulerRunning();

  try {
    const result = await runPoll();
    if (result.ok) {
      console.log(
        `[triggers] warm poll complete: ${result.added} milestone(s) loaded`
      );
    } else {
      console.warn('[triggers] warm poll failed:', result.reason);
    }
  } catch (err) {
    console.warn('[triggers] warm poll error:', (err as Error).message);
  }
}

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createPost();
    const input = await c.req.json<OnAppInstallRequest>();
    if (input.type !== 'AppInstall') {
      return c.json<TriggerResponse>(
        {
          status: 'error',
          message: 'Invalid lifecycle trigger type',
        },
        400
      );
    }

    await initWikiAndScheduler();

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

/** onAppUpgrade fires every time devvit install updates the app. */
triggers.post('/on-app-upgrade', async (c) => {
  try {
    const input = await c.req.json<OnAppUpgradeRequest>();
    if (input.type !== 'AppUpgrade') {
      return c.json<TriggerResponse>(
        {
          status: 'error',
          message: 'Invalid lifecycle trigger type',
        },
        400
      );
    }
    await initWikiAndScheduler();
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: 'App upgraded — scheduler refreshed and feed warmed',
      },
      200
    );
  } catch (error) {
    console.error('[triggers] upgrade error:', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Upgrade handler failed' },
      400
    );
  }
});
