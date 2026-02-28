/**
 * Runtime Integration Tests (Gap 9)
 *
 * Boots a real orchestrator process and validates the live middleware chain:
 * auth, validation, task allowlist behavior, and webhook HMAC verification.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import net from 'node:net';
import { resolve, join } from 'node:path';
import { readFile, rename, access } from 'node:fs/promises';
import { computeWebhookSignature } from '../src/middleware/auth.js';

const TEST_API_KEY = 'integration-test-api-key';
const TEST_WEBHOOK_SECRET = 'integration-test-webhook-secret';

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function getFreePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectPort(new Error('Unable to allocate a free port'));
        return;
      }
      const { port } = address;
      server.close(() => resolvePort(port));
    });
    server.on('error', rejectPort);
  });
}

async function waitForHealthy(baseUrl: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        const body = await response.json() as { status?: string };
        if (body.status === 'healthy') {
          return;
        }
      }
    } catch {
      // keep retrying until timeout
    }
    await sleep(500);
  }
  throw new Error('Orchestrator failed health check before timeout');
}

describe('Runtime Integration: Live Middleware Chain', () => {
  let serverProcess: ChildProcessWithoutNullStreams | null = null;
  let baseUrl = '';
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let stateFilePath = '';
  let digestDirPath = '';

  const triggerTask = async (type: string, payload: Record<string, unknown>) => {
    const response = await fetch(`${baseUrl}/api/tasks/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify({ type, payload }),
    });

    const body = await response.json() as { status: string; type: string; taskId: string };
    expect(response.status).toBe(202);
    expect(body.status).toBe('queued');
    return body.taskId;
  };

  const waitForTaskHistoryRecord = async (taskId: string, timeoutMs = 45000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const raw = await readFile(stateFilePath, 'utf-8');
        const parsed = JSON.parse(raw) as {
          taskHistory?: Array<{ id?: string; type?: string; result?: 'ok' | 'error'; message?: string }>;
        };
        const found = parsed.taskHistory?.find((entry) => entry?.id === taskId);
        if (found) {
          return found;
        }
      } catch {
        // retry until timeout
      }
      await sleep(250);
    }

    throw new Error(`Task history record not found for taskId=${taskId}`);
  };

  beforeAll(async () => {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    const tsxCliPath = resolve(process.cwd(), '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const configPath = resolve(process.cwd(), '..', 'orchestrator_config.json');
    const configRaw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(configRaw) as { stateFile: string; digestDir?: string };
    stateFilePath = config.stateFile;
    digestDirPath = config.digestDir ?? join(process.cwd(), '..', 'logs', 'digests');

    serverProcess = spawn(process.execPath, [tsxCliPath, 'src/index.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        API_KEY: TEST_API_KEY,
        WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
        MONGO_PASSWORD: process.env.MONGO_PASSWORD ?? 'test-mongo-password',
        REDIS_PASSWORD: process.env.REDIS_PASSWORD ?? 'test-redis-password',
        MONGO_USERNAME: process.env.MONGO_USERNAME ?? 'test-mongo-user',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'mongodb://127.0.0.1:1/orchestrator?serverSelectionTimeoutMS=1000&connectTimeoutMS=1000',
        DB_NAME: process.env.DB_NAME ?? 'orchestrator',
        ALERTS_ENABLED: 'false',
        ORCHESTRATOR_FAST_START: 'true',
      },
      stdio: 'pipe',
    });

    serverProcess.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
    });
    serverProcess.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    await new Promise<void>((resolveReady, rejectReady) => {
      serverProcess?.once('spawn', () => resolveReady());
      serverProcess?.once('error', (error) => rejectReady(error));
    });

    try {
      await waitForHealthy(baseUrl);
    } catch (error) {
      if (serverProcess.exitCode !== null) {
        throw new Error(
          `Orchestrator exited before readiness (code=${serverProcess.exitCode}).\nSTDOUT:\n${stdoutBuffer}\nSTDERR:\n${stderrBuffer}`,
        );
      }
      throw new Error(
        `Orchestrator failed health check before timeout.\nSTDOUT:\n${stdoutBuffer}\nSTDERR:\n${stderrBuffer}`,
      );
    }
  }, 45000);

  afterAll(async () => {
    if (!serverProcess) return;

    if (serverProcess.exitCode === null) {
      serverProcess.kill('SIGTERM');
      await new Promise<void>((resolveExit) => {
        const timeout = setTimeout(() => {
          if (serverProcess && serverProcess.exitCode === null) {
            serverProcess.kill('SIGKILL');
          }
        }, 5000);

        serverProcess?.once('exit', () => {
          clearTimeout(timeout);
          resolveExit();
        });
      });
    }
  });

  it('serves public health endpoint from live process', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const body = await response.json() as { status: string };
    expect(body.status).toBe('healthy');
  });

  it('rejects protected endpoint without bearer token', async () => {
    const response = await fetch(`${baseUrl}/api/tasks/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'heartbeat', payload: {} }),
    });

    expect(response.status).toBe(401);
  });

  it('accepts protected endpoint with valid bearer token', async () => {
    const response = await fetch(`${baseUrl}/api/tasks/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify({ type: 'heartbeat', payload: { reason: 'integration-test' } }),
    });

    expect(response.status).toBe(202);
    const body = await response.json() as { status: string; type: string };
    expect(body.status).toBe('queued');
    expect(body.type).toBe('heartbeat');
  });

  it('records success as ok and handler exceptions as error in task history', async () => {
    const runNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const successTaskId = await triggerTask('heartbeat', {
      reason: 'result-semantics-success',
      runNonce,
    });
    const successRecord = await waitForTaskHistoryRecord(successTaskId);
    expect(successRecord.result).toBe('ok');
    expect(successRecord.message).toContain('heartbeat');

    const backupDigestDir = `${digestDirPath}.vitest-bak-${Date.now()}`;
    let movedDigestDir = false;

    try {
      try {
        await access(digestDirPath);
        await rename(digestDirPath, backupDigestDir);
        movedDigestDir = true;
      } catch {
        movedDigestDir = false;
      }

      const failingTaskId = await triggerTask('send-digest', {
        reason: 'result-semantics-failure',
        runNonce,
      });
      const failingRecord = await waitForTaskHistoryRecord(failingTaskId);
      expect(failingRecord.result).toBe('error');
      expect(failingRecord.message ?? '').toContain('send-digest failed:');
    } finally {
      if (movedDigestDir) {
        await rename(backupDigestDir, digestDirPath);
      }
    }
  });

  it('records integration-workflow success:false as error', async () => {
    const failingTaskId = await triggerTask('integration-workflow', {
      type: 'workflow',
      steps: [
        {
          name: 'force-failure',
          agent: 'integration-agent',
          optional: false,
          simulateFailure: true,
        },
      ],
    });

    const failingRecord = await waitForTaskHistoryRecord(failingTaskId);
    expect(failingRecord.result).toBe('error');
    expect(failingRecord.message ?? '').toContain('integration workflow failed:');
  });

  it('rejects invalid task type through validation middleware', async () => {
    const response = await fetch(`${baseUrl}/api/tasks/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify({ type: 'invalid-task-type', payload: {} }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects webhook requests with missing signature', async () => {
    const payload = {
      alerts: [
        {
          status: 'firing',
          labels: { alertname: 'CPUHigh', severity: 'warning' },
          annotations: { summary: 'CPU is high' },
        },
      ],
    };

    const response = await fetch(`${baseUrl}/webhook/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(401);
  });

  it('accepts canonical webhook signature across key-order variations', async () => {
    const orderedPayload = {
      alerts: [
        {
          status: 'firing',
          labels: { alertname: 'DiskFull', severity: 'critical', agent: 'system-monitor-agent' },
          annotations: { description: 'Disk > 95%', summary: 'Disk pressure high' },
        },
      ],
      groupLabels: { service: 'orchestrator' },
    };

    const reorderedPayload = {
      groupLabels: { service: 'orchestrator' },
      alerts: [
        {
          annotations: { summary: 'Disk pressure high', description: 'Disk > 95%' },
          labels: { severity: 'critical', agent: 'system-monitor-agent', alertname: 'DiskFull' },
          status: 'firing',
        },
      ],
    };

    const signature = computeWebhookSignature(orderedPayload, TEST_WEBHOOK_SECRET);

    const response = await fetch(`${baseUrl}/webhook/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
      },
      body: JSON.stringify(reorderedPayload),
    });

    expect(response.status).toBe(200);
  });

  it('rejects webhook requests with invalid signature', async () => {
    const payload = {
      alerts: [
        {
          status: 'firing',
          labels: { alertname: 'MemoryHigh', severity: 'warning' },
          annotations: { summary: 'Memory high' },
        },
      ],
    };

    const response = await fetch(`${baseUrl}/webhook/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': 'deadbeef',
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(401);
  });

  it('keeps process alive during middleware assertions', () => {
    expect(serverProcess).not.toBeNull();
    expect(serverProcess?.exitCode).toBeNull();
    expect(stdoutBuffer.length + stderrBuffer.length).toBeGreaterThanOrEqual(0);
  });
});
