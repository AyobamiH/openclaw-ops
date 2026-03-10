import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import type { JsonValue } from '@devvit/shared-types/json.js'
import { getDevvitConfig } from '@devvit/shared-types/server/get-devvit-config.js'
import { redis, realtime } from '@devvit/web/server'

type StandaloneState = {
  kv: Record<string, string>
}

const DEFAULT_STATE_PATH = resolve(
  process.cwd(),
  'data',
  'standalone-state.json'
)

let standaloneWriteQueue = Promise.resolve()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStandaloneState(value: unknown): value is StandaloneState {
  if (!isRecord(value) || !isRecord(value.kv)) return false
  return Object.values(value.kv).every((entry) => typeof entry === 'string')
}

export function isDevvitRuntimeAvailable(): boolean {
  try {
    getDevvitConfig()
    return true
  } catch {
    return false
  }
}

export function resolveStandaloneStatePath(): string {
  const configuredPath = process.env.OPENCLAWDBOT_STATE_PATH?.trim()
  return configuredPath ? resolve(configuredPath) : DEFAULT_STATE_PATH
}

async function readStandaloneState(): Promise<StandaloneState> {
  try {
    const raw = await readFile(resolveStandaloneStatePath(), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!isStandaloneState(parsed)) {
      return { kv: {} }
    }
    return parsed
  } catch {
    return { kv: {} }
  }
}

async function writeStandaloneState(state: StandaloneState): Promise<void> {
  const outputPath = resolveStandaloneStatePath()
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(state, null, 2))
}

async function mutateStandaloneState<T>(
  mutator: (state: StandaloneState) => Promise<T> | T
): Promise<T> {
  const next = standaloneWriteQueue.then(async () => {
    const state = await readStandaloneState()
    const result = await mutator(state)
    await writeStandaloneState(state)
    return result
  })

  standaloneWriteQueue = next.then(
    () => undefined,
    () => undefined
  )

  return next
}

export async function runtimeGet(key: string): Promise<string | null> {
  if (isDevvitRuntimeAvailable()) {
    const value = await redis.get(key)
    return value ?? null
  }

  await standaloneWriteQueue
  const state = await readStandaloneState()
  return state.kv[key] ?? null
}

export async function runtimeSet(key: string, value: string): Promise<void> {
  if (isDevvitRuntimeAvailable()) {
    await redis.set(key, value)
    return
  }

  await mutateStandaloneState((state) => {
    state.kv[key] = value
  })
}

export async function runtimeSend<T extends JsonValue>(
  channel: string,
  payload: T
): Promise<void> {
  if (!isDevvitRuntimeAvailable()) return
  await realtime.send(channel, payload)
}

export async function resolveSigningSecret(
  key: string
): Promise<string | null> {
  const storedSecret = await runtimeGet(key)
  if (storedSecret && storedSecret.trim().length > 0) {
    return storedSecret.trim()
  }

  const envSecret = process.env.MILESTONE_SIGNING_SECRET?.trim()
  if (!envSecret) return null
  return envSecret
}
