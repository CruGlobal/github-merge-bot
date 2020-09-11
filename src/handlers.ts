// handler.js

const { serverless } = require('@probot/serverless-lambda')
const appFn = require('./bot')
export const probot = serverless(appFn)
