import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context, scheduler, redis, reddit } from '@devvit/web/server';
import { createPost } from '../core/post';
import { FEED_URL_REDIS_KEY } from './scheduler';
import { SIGNING_SECRET_REDIS_KEY } from './forms';

// Default feed configuration — auto-seeded on every install so the app
// works immediately without requiring manual moderator setup.
const DEFAULT_FEED_URL =
  'https://raw.githubusercontent.com/AyobamiH/openclaw-ops/master/orchestrator/data/milestones-feed.json';
const DEFAULT_SIGNING_SECRET =
  '96a9cb3cbfcd8f54ffd3255c5ab526dec5c5acf343eda62751bac5e682ebade3';

// Initial milestone feed seeded into the wiki on first install.
// The scheduler reads from the wiki (no external HTTP needed).
const INITIAL_WIKI_FEED = JSON.stringify({
  lastUpdated: '2026-02-23T11:07:15.898Z',
  entries: [
    {
      idempotencyKey: 'orchestrator.started.2026-02-23T06:29:06.103Z',
      sentAtUtc: '2026-02-23T06:29:06.103Z',
      event: {
        milestoneId: 'orchestrator.started.2026-02-23T06:29:06.103Z',
        timestampUtc: '2026-02-23T06:29:06.103Z',
        scope: 'runtime',
        claim: 'Orchestrator started successfully.',
        evidence: [{ type: 'log', path: '/app/data/orchestrator-state.json', summary: 'lastStartedAt set in orchestrator state' }],
        riskStatus: 'on-track',
        nextAction: 'Monitor task queue for first incoming tasks.',
        source: 'orchestrator',
      },
      signature: 'c207b60453e60c913bd3519901e6c91f8b22d34b6d59d50b3ed88dfe6463496a',
    },
    {
      idempotencyKey: 'orchestrator.started.2026-02-23T07:26:21.259Z',
      sentAtUtc: '2026-02-23T07:26:21.259Z',
      event: {
        milestoneId: 'orchestrator.started.2026-02-23T07:26:21.259Z',
        timestampUtc: '2026-02-23T07:26:21.259Z',
        scope: 'runtime',
        claim: 'Orchestrator started successfully.',
        evidence: [{ type: 'log', path: '/app/data/orchestrator-state.json', summary: 'lastStartedAt set in orchestrator state' }],
        riskStatus: 'on-track',
        nextAction: 'Monitor task queue for first incoming tasks.',
        source: 'orchestrator',
      },
      signature: '2af2e94b63401c19922c9a839e4e85378bf964fed7217a5ee4efca191e9097d2',
    },
    {
      idempotencyKey: 'orchestrator.started.2026-02-23T08:21:03.470Z',
      sentAtUtc: '2026-02-23T08:21:03.470Z',
      event: {
        milestoneId: 'orchestrator.started.2026-02-23T08:21:03.470Z',
        timestampUtc: '2026-02-23T08:21:03.470Z',
        scope: 'runtime',
        claim: 'Orchestrator started successfully.',
        evidence: [{ type: 'log', path: '/app/data/orchestrator-state.json', summary: 'lastStartedAt set in orchestrator state' }],
        riskStatus: 'on-track',
        nextAction: 'Monitor task queue for first incoming tasks.',
        source: 'orchestrator',
      },
      signature: '577cb7e82ccddc92278734685a979beb556d4114f074681c9019efb6a85c9eab',
    },
    {
      idempotencyKey: 'orchestrator.started.2026-02-23T11:07:15.898Z',
      sentAtUtc: '2026-02-23T11:07:15.898Z',
      event: {
        milestoneId: 'orchestrator.started.2026-02-23T11:07:15.898Z',
        timestampUtc: '2026-02-23T11:07:15.898Z',
        scope: 'runtime',
        claim: 'Orchestrator started successfully.',
        evidence: [{ type: 'log', path: '/app/data/orchestrator-state.json', summary: 'lastStartedAt set in orchestrator state' }],
        riskStatus: 'on-track',
        nextAction: 'Monitor task queue for first incoming tasks.',
        source: 'orchestrator',
      },
      signature: '0000000000000000000000000000000000000000000000000000000000000000',
    },
  ],
});

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

    // Initialize the milestones wiki page (used by scheduler instead of external fetch).
    try {
      await reddit.updateWikiPage({
        subredditName: context.subredditName,
        page: 'milestones-feed',
        content: INITIAL_WIKI_FEED,
        reason: 'Initialized by openclawdbot on install',
      });
      console.log('[triggers] milestones wiki page initialized');
    } catch (err) {
      console.warn('[triggers] failed to init wiki page:', (err as Error).message);
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
