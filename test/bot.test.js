const nock = require('nock')
// Requiring our app implementation
const myProbotApp = require('../src/bot.js')
const { Probot } = require('probot')
// Requiring our fixtures
const labeledPayload = require('./fixtures/pull_request.labeled')
const synchronizePayload = require('./fixtures/pull_request.synchronize')
const issueCreatedBody = {
  body: "I see you added the \"On Staging\" label, I'll get this merged to the staging branch!"
}
const mergeBody = {
  base: 'staging',
  head: 'asdf1234'
}

nock.disableNetConnect()

describe('Staging Merger Bot', () => {
  let probot

  beforeEach(() => {
    probot = new Probot({ id: 123, githubToken: 'test' })
    // Load our app into probot
    probot.load(myProbotApp)
  })

  describe('on label add', () => {
    let commentMock
    let mergeMock

    beforeEach(() => {
      nock('https://api.github.com')
        .post('/app/installations/2/access_tokens')
        .reply(200, { token: 'test' })
      commentMock = nock('https://api.github.com')
        .post('/repos/soberstadt/test-merge-repo/issues/2/comments', (body) => {
          expect(body).toMatchObject(issueCreatedBody)
          return true
        })
        .reply(200)

      const configHash = "{ enabled: true, 'label-name': 'On Staging', comment: true }"
      const encodedConfig = Buffer.from(configHash).toString('base64')
      nock('https://api.github.com')
        .get('/repos/soberstadt/test-merge-repo/contents/.github/merge-bot.yml')
        .reply(200, { content: encodedConfig })

      // allow test to get PR details
      nock('https://api.github.com')
        .get('/repos/soberstadt/test-merge-repo/pulls/2')
        .reply(200, { head: { ref: 'asdf1234' } })

      mergeMock = nock('https://api.github.com')
        .post('/repos/soberstadt/test-merge-repo/merges', (body) => {
          console.log(body)
          expect(body).toMatchObject(mergeBody)
          return true
        })
        .reply(200)
    })

    test('creates a comment when tag is added', async () => {
      await probot.receive({ name: 'pull_request', payload: labeledPayload })

      expect(commentMock.activeMocks()).toStrictEqual([])
    })

    test('merges branch into staging', async () => {
      await probot.receive({ name: 'pull_request', payload: labeledPayload })

      expect(mergeMock.activeMocks()).toStrictEqual([])
    })
  })

  describe('on pr sync', () => {
    let mergeMock

    beforeEach(() => {
      nock('https://api.github.com')
        .post('/app/installations/2/access_tokens')
        .reply(200, { token: 'test' })

      const configHash = "{ enabled: true, 'label-name': 'On Staging', comment: true }"
      const encodedConfig = Buffer.from(configHash).toString('base64')
      nock('https://api.github.com')
        .get('/repos/soberstadt/test-merge-repo/contents/.github/merge-bot.yml')
        .reply(200, { content: encodedConfig })

      // allow test to get PR details
      nock('https://api.github.com')
        .get('/repos/soberstadt/test-merge-repo/pulls/2')
        .reply(200, { head: { ref: 'asdf1234' } })

      // allow test to get PR labels
      nock('https://api.github.com')
        .get('/repos/soberstadt/test-merge-repo/issues/2/labels')
        .reply(200, [{ name: 'On Staging' }])

      mergeMock = nock('https://api.github.com')
        .post('/repos/soberstadt/test-merge-repo/merges', (body) => {
          expect(body).toMatchObject(mergeBody)
          return true
        })
        .reply(200)
    })

    test('merges branch into staging', async () => {
      await probot.receive({ name: 'pull_request', payload: synchronizePayload })

      expect(mergeMock.activeMocks()).toStrictEqual([])
    })
  })

  afterEach(() => {
    nock.cleanAll()
  })
})
