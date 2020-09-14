import { Probot } from 'probot'
import { MergerBot } from './bot'

// pass a probot app as a function
Probot.run(MergerBot)
