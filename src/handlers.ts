const { serverless } = require('@probot/serverless-lambda')
import { MergerBot } from './bot'
export const probot = serverless(MergerBot)
