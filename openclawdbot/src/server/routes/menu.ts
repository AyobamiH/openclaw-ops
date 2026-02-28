import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import type { Form } from '@devvit/shared-types/shared/form.js';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';

export const menu = new Hono();

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
    'Enter the raw GitHub URL for the milestones-feed.json file. Example: https://raw.githubusercontent.com/YourUser/openclaw-ops/main/data/milestones-feed.json',
  acceptLabel: 'Save URL',
  cancelLabel: 'Cancel',
  fields: [
    {
      name: 'feedUrl',
      type: 'string',
      label: 'Feed URL (https://)',
      helpText: 'Must be a publicly accessible HTTPS URL returning milestones-feed.json',
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
