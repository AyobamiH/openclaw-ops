/**
 * Writes the milestone feed JSON to the Reddit wiki page used by the Devvit
 * scheduler. Uses Reddit's password-grant OAuth (personal bot / script app),
 * which still works for personal-use bots as of 2025.
 *
 * Required env vars:
 *   REDDIT_CLIENT_ID      — from https://www.reddit.com/prefs/apps (script type)
 *   REDDIT_CLIENT_SECRET  — from the same app
 *   REDDIT_USERNAME       — bot account username (must be mod of the subreddit)
 *   REDDIT_PASSWORD       — bot account password
 *
 * Optional env vars:
 *   REDDIT_SUBREDDIT      — defaults to "openclawdbot_dev"
 *   REDDIT_WIKI_PAGE      — defaults to "milestones-feed"
 *   REDDIT_USER_AGENT     — defaults to "openclawdbot-orchestrator/1.0"
 */

const DEFAULT_SUBREDDIT = 'openclawdbot_dev';
const DEFAULT_WIKI_PAGE = 'milestones-feed';
const DEFAULT_USER_AGENT = 'openclawdbot-orchestrator/1.0';

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiresAt) return _cachedToken;

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  const userAgent = process.env.REDDIT_USER_AGENT ?? DEFAULT_USER_AGENT;

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error(
      'Reddit credentials not configured. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD in .env',
    );
  }

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username,
      password,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Reddit OAuth token request failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!data.access_token) {
    throw new Error(`Reddit OAuth failed: ${data.error ?? 'no access_token in response'}`);
  }

  _cachedToken = data.access_token;
  // Expire 60s early to be safe
  _tokenExpiresAt = now + (data.expires_in ?? 3600) * 1000 - 60_000;
  return _cachedToken;
}

/**
 * Writes `content` (JSON string) to the Reddit wiki page used by the Devvit
 * scheduler. Idempotent — calling it twice with the same content is fine.
 */
export async function writeToWiki(content: string): Promise<void> {
  const subreddit = process.env.REDDIT_SUBREDDIT ?? DEFAULT_SUBREDDIT;
  const wikiPage = process.env.REDDIT_WIKI_PAGE ?? DEFAULT_WIKI_PAGE;
  const userAgent = process.env.REDDIT_USER_AGENT ?? DEFAULT_USER_AGENT;

  const token = await getAccessToken();

  const res = await fetch(`https://oauth.reddit.com/r/${subreddit}/api/wiki/edit`, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: new URLSearchParams({
      page: wikiPage,
      content,
      reason: 'milestone update',
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Reddit wiki edit failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
}
