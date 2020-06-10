const { Probot } = require('probot')
const app = require('./bot.js')

// pass a probot app as a function
Probot.run(app)
