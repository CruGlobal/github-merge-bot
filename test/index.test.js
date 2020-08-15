const nock = require('nock')
// Requiring our app implementation
const myProbotApp = require('../src/bot.js')
const { Probot } = require('probot')
// Requiring our fixtures
const payload = require('./fixtures/pull_request.labeled')
const issueCreatedBody = { body: "I see you added the \"On Staging\" label, I'll get this merged to the staging branch!" }
const fs = require('fs')
const path = require('path')

describe('Staging Merger Bot', () => {
  let probot
  let mockCert

  beforeAll((done) => {
    fs.readFile(path.join(__dirname, 'fixtures/mock-cert.pem'), (err, cert) => {
      if (err) return done(err)
      mockCert = cert
      done()
    })
  })

  beforeEach(() => {
    nock.disableNetConnect()
    probot = new Probot({ id: 123, cert: mockCert })
    // Load our app into probot
    probot.load(myProbotApp)
  })

  test('creates a comment when tag is added', async () => {
    // Test that we correctly return a test token
    nock('https://api.github.com')
      .post('/app/installations/2/access_tokens')
      .reply(200, { token: 'test' })

    // Test that a comment is posted
    nock('https://api.github.com')
      .post('/repos/soberstadt/test-merge-repo/issues/2/comments', (body) => {
        expect(body).toMatchObject(issueCreatedBody)
        return true
      })
      .reply(200)

    const encodedConfig = Buffer.from('{enabled: true, label-name: On Staging, comment: true}').toString('base64')
    nock('https://api.github.com')
      .get('/repos/soberstadt/test-merge-repo/contents/.github/merge-bot.yml')
      .reply(200, { content: encodedConfig })

    // allow test to get PR details
    nock('https://api.github.com')
      .get('/repos/soberstadt/test-merge-repo/pulls/2')
      .reply(200, { head: { ref: 'asdf1234' } })

    // Test that a merge is posted
    nock('https://api.github.com')
      .post('/repos/soberstadt/test-merge-repo/merges')
      .reply(200)

    // Receive a webhook event
    await probot.receive({ name: 'pull_request', payload })
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })
})

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about testing with Nock see:
// https://github.com/nock/nock
