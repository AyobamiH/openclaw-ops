import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { redis } from '@devvit/web/server';

export const SIGNING_SECRET_REDIS_KEY = 'milestones:signing-secret';
export const FEED_URL_REDIS_KEY = 'milestones:feed-url';

type ExampleFormValues = {
  message?: string;
};

type MilestoneSecretFormValues = {
  secret?: string;
};

type MilestoneFeedUrlFormValues = {
  feedUrl?: string;
};

export const forms = new Hono();

forms.post('/example-submit', async (c) => {
  const { message } = await c.req.json<ExampleFormValues>();
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  return c.json<UiResponse>(
    {
      showToast: trimmedMessage
        ? `Form says: ${trimmedMessage}`
        : 'Form submitted with no message',
    },
    200
  );
});

forms.post('/milestone-secret-submit', async (c) => {
  const { secret } = await c.req.json<MilestoneSecretFormValues>();
  const trimmed = typeof secret === 'string' ? secret.trim() : '';

  if (!trimmed) {
    return c.json<UiResponse>({ showToast: 'Secret cannot be empty.' }, 400);
  }
  if (!/^[0-9a-fA-F]{32,}$/.test(trimmed)) {
    return c.json<UiResponse>(
      { showToast: 'Secret must be a hex string of at least 32 characters.' },
      400
    );
  }

  await redis.set(SIGNING_SECRET_REDIS_KEY, trimmed);

  return c.json<UiResponse>(
    { showToast: { text: 'Milestone secret saved.', appearance: 'success' } },
    200
  );
});

forms.post('/milestone-feed-url-submit', async (c) => {
  const { feedUrl } = await c.req.json<MilestoneFeedUrlFormValues>();
  const trimmed = typeof feedUrl === 'string' ? feedUrl.trim() : '';

  if (!trimmed) {
    return c.json<UiResponse>({ showToast: 'Feed URL cannot be empty.' }, 400);
  }
  if (!trimmed.startsWith('https://')) {
    return c.json<UiResponse>({ showToast: 'Feed URL must start with https://' }, 400);
  }

  await redis.set(FEED_URL_REDIS_KEY, trimmed);

  return c.json<UiResponse>(
    { showToast: { text: 'Feed URL saved. Polling every minute.', appearance: 'success' } },
    200
  );
});
