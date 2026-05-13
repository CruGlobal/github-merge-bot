import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context as LambdaContext,
} from 'aws-lambda'
import { Probot } from 'probot'

import { MergerBot } from './bot.js'

// Probot instance is created once per container and reused across invocations.
let probotPromise: Promise<Probot> | undefined

async function getProbot(): Promise<Probot> {
  if (!probotPromise) {
    probotPromise = (async () => {
      const probot = new Probot({
        appId: requiredEnv('APP_ID'),
        privateKey: requiredEnv('PRIVATE_KEY'),
        secret: requiredEnv('WEBHOOK_SECRET'),
      })
      await probot.load(MergerBot)
      return probot
    })()
  }
  return probotPromise
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function lowercaseHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) result[key.toLowerCase()] = value
  }
  return result
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  _context: LambdaContext,
): Promise<APIGatewayProxyResultV2> => {
  const probot = await getProbot()
  const headers = lowercaseHeaders(event.headers as Record<string, string | undefined>)

  const id = headers['x-github-delivery']
  const name = headers['x-github-event']
  const signature = headers['x-hub-signature-256'] ?? headers['x-hub-signature']

  if (!id || !name || !signature) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing webhook headers' }) }
  }

  const rawBody = event.body ?? ''
  const payload = event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody

  await probot.webhooks.verifyAndReceive({
    id,
    // The webhooks library accepts any event name string; cast keeps TS happy.
    name: name as Parameters<typeof probot.webhooks.verifyAndReceive>[0]['name'],
    signature,
    payload,
  })

  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
