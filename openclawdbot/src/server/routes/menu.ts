import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import type { Form } from '@devvit/shared-types/shared/form.js';
import { context, scheduler, redis, reddit } from '@devvit/web/server';
import {
  buildInitialWikiFeed,
  DEFAULT_FEED_URL,
  MILESTONE_WIKI_PAGE,
} from '../core/milestone-pipeline';
import { createPost } from '../core/post';
import { runPoll, FEED_URL_REDIS_KEY } from './scheduler';
import { SIGNING_SECRET_REDIS_KEY } from './forms';

export const menu = new Hono();

async function loadConfiguredSigningSecret(): Promise<string | null> {
  const secret = await redis.get(SIGNING_SECRET_REDIS_KEY);
  return typeof secret === 'string' && secret.trim().length > 0
    ? secret.trim()
    : null;
}

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

menu.post('/example-form', async (c) => {
  return c.json<UiResponse>(
    {
      showToast: 'Form feature coming soon.',
    },
    200
  );
});

const milestoneSecretForm: Form = {
  title: 'Configure Milestone Pipeline Secret',
  description:
    'Enter the HMAC-SHA256 signing secret shared with the OpenClaw orchestrator. This must match MILESTONE_SIGNING_SECRET in orchestrator/.env.',
  acceptLabel: 'Save Secret',
  cancelLabel: 'Cancel',
  fields: [
    {
      name: 'secret',
      type: 'string',
      label: 'Signing Secret (hex)',
      helpText: '256-bit hex string. Rotate both sides atomically.',
      required: true,
      isSecret: true,
      scope: 'app',
    },
  ],
};

menu.post('/milestone-secret', async (c) => {
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'milestoneSecretForm',
        form: milestoneSecretForm,
      },
    },
    200
  );
});

const milestoneFeedUrlForm: Form = {
  title: 'Configure Milestone Feed URL',
  description:
    'Enter the feed URL for milestones-feed.json. Recommended format: https://cdn.jsdelivr.net/gh/YourUser/openclaw-ops@main/orchestrator/data/milestones-feed.json',
  acceptLabel: 'Save URL',
  cancelLabel: 'Cancel',
  fields: [
    {
      name: 'feedUrl',
      type: 'string',
      label: 'Feed URL (https://)',
      helpText:
        'Must be a publicly accessible HTTPS URL returning milestones-feed.json',
      required: true,
    },
  ],
};

menu.post('/milestone-feed-url', async (c) => {
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'milestoneFeedUrlForm',
        form: milestoneFeedUrlForm,
      },
    },
    200
  );
});

menu.post('/start-milestone-scheduler', async (c) => {
  try {
    await scheduler.runJob({ name: 'pollMilestoneFeed', cron: '* * * * *' });
    const result = await runPoll();
    return c.json<UiResponse>(
      {
        showToast: {
          text: result.ok
            ? `Milestone scheduler started — ${result.added} milestone(s) loaded immediately.`
            : `Scheduler started, but warm poll failed: ${result.reason}`,
          appearance: result.ok ? 'success' : 'neutral',
        },
      },
      200
    );
  } catch (err) {
    return c.json<UiResponse>(
      { showToast: `Scheduler start failed: ${(err as Error).message}` },
      200
    );
  }
});

menu.post('/force-poll-milestones', async (c) => {
  try {
    const result = await runPoll();
    if (result.ok) {
      return c.json<UiResponse>(
        {
          showToast: {
            text: `Poll complete — ${result.added} new milestone(s) loaded.`,
            appearance: 'success',
          },
        },
        200
      );
    }
    return c.json<UiResponse>(
      { showToast: `Poll failed: ${result.reason}` },
      200
    );
  } catch (err) {
    return c.json<UiResponse>(
      { showToast: `Poll error: ${(err as Error).message}` },
      200
    );
  }
});

menu.post('/sync-github-to-wiki', async (c) => {
  // Writes a locally generated, secret-signed bootstrap milestone feed to the
  // wiki so the scheduler can read it without requiring external HTTP.
  try {
    const signingSecret = await loadConfiguredSigningSecret();
    if (!signingSecret) {
      return c.json<UiResponse>(
        {
          showToast:
            'Configure the milestone signing secret before seeding the wiki.',
        },
        200
      );
    }

    await reddit.updateWikiPage({
      subredditName: context.subredditName,
      page: MILESTONE_WIKI_PAGE,
      content: buildInitialWikiFeed(signingSecret),
      reason: 'Initialized by moderator via menu',
    });
    // Immediately run a poll so new milestones appear without waiting 1 min
    const result = await runPoll();
    const loaded = result.ok ? result.added : 0;
    return c.json<UiResponse>(
      {
        showToast: {
          text: `Milestone wiki initialized — ${loaded} milestone(s) loaded.`,
          appearance: 'success',
        },
      },
      200
    );
  } catch (err) {
    return c.json<UiResponse>(
      { showToast: `Init failed: ${(err as Error).message}` },
      200
    );
  }
});

menu.post('/reset-defaults', async (c) => {
  try {
    await redis.set(FEED_URL_REDIS_KEY, DEFAULT_FEED_URL);
    await scheduler.runJob({ name: 'pollMilestoneFeed', cron: '* * * * *' });
    const signingSecret = await loadConfiguredSigningSecret();
    if (!signingSecret) {
      return c.json<UiResponse>(
        {
          showToast: {
            text: 'Feed URL reset. Configure a signing secret before polling resumes.',
            appearance: 'neutral',
          },
        },
        200
      );
    }

    const result = await runPoll();
    return c.json<UiResponse>(
      {
        showToast: {
          text: result.ok
            ? `Feed URL reset. Existing signing secret preserved, and ${result.added} milestone(s) loaded.`
            : `Feed URL reset. Existing signing secret preserved, but warm poll failed: ${result.reason}`,
          appearance: result.ok ? 'success' : 'neutral',
        },
      },
      200
    );
  } catch (err) {
    return c.json<UiResponse>(
      { showToast: `Reset failed: ${(err as Error).message}` },
      200
    );
  }
});
