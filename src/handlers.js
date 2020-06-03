// handler.js
const { serverless } = require("@probot/serverless-lambda");
const appFn = require("./bot.js");
module.exports.probot = serverless(appFn);
