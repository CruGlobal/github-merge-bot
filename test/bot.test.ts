import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import nock from 'nock'
import { Probot, ProbotOctokit } from 'probot'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { MergerBot } from '../src/bot.js'

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const labeledPayload = loadFixture('pull_request.labeled.json')
const synchronizePayload = loadFixture('pull_request.synchronize.json')
const pushPayload = loadFixture('push.json')
const privateKey = readFileSync(resolve(fixturesDir, 'mock-cert.pem'), 'utf8')

const baseConfigYaml = "enabled: true\nlabel_name: 'On Staging'\ncomment: true\n"
const watchDefaultConfigYaml = `${baseConfigYaml}watch_default_branch: true\n`

const issueCreatedBody = {
  body: "I see you added the \"On Staging\" label, I'll get this merged to the staging branch!",
}
const mergeBody = {
  base: 'staging',
  head: 'test2',
  commit_message: "Merge branch 'test2' (PR #2) into staging",
}

nock.disableNetConnect()

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf8')) as Record<string, unknown>
}

function newProbot(): Probot {
  return new Probot({
    appId: 123,
    privateKey,
    Octokit: ProbotOctokit.defaults({
      retry: { enabled: false },
      throttle: { enabled: false },
    }),
  })
}

// The plugin requests raw text (Accept: application/vnd.github.raw); reply
// with the YAML body. The charset suffix is what makes @octokit/request
// decode the body as text instead of an ArrayBuffer.
function mockConfig(scope: nock.Scope, yaml: string): nock.Scope {
  return scope
    .get('/repos/soberstadt/test-merge-repo/contents/.github%2Fmerge-bot.yml')
    .reply(200, yaml, { 'Content-Type': 'application/vnd.github.raw; charset=utf-8' })
}

describe('Staging Merger Bot', () => {
  let probot: Probot

  beforeEach(async () => {
    probot = newProbot()
    await probot.load(MergerBot)

    nock('https://api.github.com')
      .post('/app/installations/2/access_tokens')
      .reply(200, { token: 'test', permissions: { issues: 'write', pull_requests: 'write' } })
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
    nock.disableNetConnect()
  })

  describe('on label add', () => {
    test('creates a comment and merges branch into staging', async () => {
      const scope = mockConfig(nock('https://api.github.com'), baseConfigYaml)
        .get('/repos/soberstadt/test-merge-repo/pulls/2')
        .reply(200, { head: { ref: 'test2' }, number: 2 })
        .post('/repos/soberstadt/test-merge-repo/issues/2/comments', (body) => {
          expect(body).toMatchObject(issueCreatedBody)
          return true
        })
        .reply(200, {})
        .post('/repos/soberstadt/test-merge-repo/merges', (body) => {
          expect(body).toMatchObject(mergeBody)
          return true
        })
        .reply(200, {})

      await probot.receive({ id: '1', name: 'pull_request', payload: labeledPayload as never })
      expect(scope.pendingMocks()).toEqual([])
    })

    test('posts a conflict comment when merge returns 409', async () => {
      const commentBodies: string[] = []
      const captureComment = (body: { body: string }): boolean => {
        commentBodies.push(body.body)
        return true
      }
      const scope = mockConfig(nock('https://api.github.com'), baseConfigYaml)
        .get('/repos/soberstadt/test-merge-repo/pulls/2')
        .reply(200, { head: { ref: 'test2' }, number: 2 })
        .post('/repos/soberstadt/test-merge-repo/issues/2/comments', captureComment)
        .reply(200, {})
        .post('/repos/soberstadt/test-merge-repo/merges')
        .reply(409, { message: 'Merge conflict' })
        .post('/repos/soberstadt/test-merge-repo/issues/2/comments', captureComment)
        .reply(200, {})

      await probot.receive({ id: '5', name: 'pull_request', payload: labeledPayload as never })
      expect(scope.pendingMocks()).toEqual([])
      expect(commentBodies).toEqual([
        issueCreatedBody.body,
        'Merge conflict attempting to merge this into staging. Please fix manually.',
      ])
    })
  })

  describe('on pr sync', () => {
    test('merges branch into staging', async () => {
      const scope = mockConfig(nock('https://api.github.com'), baseConfigYaml)
        .get('/repos/soberstadt/test-merge-repo/issues/2/labels')
        .reply(200, [{ name: 'On Staging' }])
        .get('/repos/soberstadt/test-merge-repo/pulls/2')
        .reply(200, { head: { ref: 'test2' }, number: 2 })
        .post('/repos/soberstadt/test-merge-repo/merges', (body) => {
          expect(body).toMatchObject(mergeBody)
          return true
        })
        .reply(200, {})

      await probot.receive({ id: '2', name: 'pull_request', payload: synchronizePayload as never })
      expect(scope.pendingMocks()).toEqual([])
    })
  })

  describe('on branch push', () => {
    // The captured push fixture predates GitHub Apps and so has no
    // `installation`; the bot's auth path needs one, so inject it.
    const pushWithInstallation = {
      ...(pushPayload as Record<string, unknown>),
      installation: { id: 2 },
    }

    test('merges default branch into staging', async () => {
      const scope = mockConfig(nock('https://api.github.com'), watchDefaultConfigYaml)
        .post('/repos/soberstadt/test-merge-repo/merges', (body) => {
          expect(body).toMatchObject({ base: 'staging', head: 'main' })
          return true
        })
        .reply(200, {})

      await probot.receive({ id: '3', name: 'push', payload: pushWithInstallation as never })
      expect(scope.pendingMocks()).toEqual([])
    })

    test('does not merge into staging if branch is not default', async () => {
      const scope = mockConfig(nock('https://api.github.com'), watchDefaultConfigYaml)

      const payloadClone = JSON.parse(JSON.stringify(pushWithInstallation)) as Record<
        string,
        unknown
      > & {
        repository: { default_branch: string }
      }
      payloadClone.repository.default_branch = 'default'

      await probot.receive({ id: '4', name: 'push', payload: payloadClone as never })
      expect(scope.pendingMocks()).toEqual([])
    })
  })
})
