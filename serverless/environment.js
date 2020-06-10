'use strict'

module.exports = () => {
  // Use dotenv to load local development overrides
  require('dotenv').config()
  return {
    ENVIRONMENT: process.env.ENVIRONMENT || 'development',
    ROLLBAR_ACCESS_TOKEN: process.env.ROLLBAR_ACCESS_TOKEN || '',
    PRIVATE_KEY: process.env.PRIVATE_KEY || '',
    DISABLE_WEBHOOK_EVENT_CHECK: process.env.DISABLE_WEBHOOK_EVENT_CHECK || '',
    APP_ID: process.env.APP_ID || '',
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
    NODE_ENV: process.env.NODE_ENV || ''
  }
}
