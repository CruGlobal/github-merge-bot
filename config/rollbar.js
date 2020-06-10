'use strict'

const Rollbar = require('rollbar')

const rollbar = new Rollbar({
  // https://rollbar.com/docs/notifier/rollbar.js/#configuration-reference
  accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
  // Enable rollbar on staging and production
  enabled: process.env.ENVIRONMENT === 'production' || process.env.ENVIRONMENT === 'staging',
  payload: {
    environment: process.env.ENVIRONMENT,
    client: {
      javascript: {
        source_map_enabled: true,
        code_version: process.env.SOURCEMAP_VERSION,
        guess_uncaught_frames: true
      }
    }
  }
})

module.exports = { rollbar: rollbar }
