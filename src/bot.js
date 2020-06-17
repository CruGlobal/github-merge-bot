'use strict'

const { rollbar } = require('../config/rollbar.js')

module.exports = app => {
  const defaultConfig = {
    enabled: false,
    label_name: 'On Staging',
    comment: true
  }

  app.router.use(rollbar.errorHandler())

  app.log.info('Yay, the app was loaded!')

  app.on('pull_request.labeled', async context => {
    const senderType = context.payload.sender.type
    app.log.debug(`New label added by a ${senderType}`)
    if (senderType === 'Bot') return

    const labelName = context.payload.label.name
    const config = await loadConfig(context)
    app.log.debug(`New label: ${config.label_name}, Looking for ${labelName}`)
    if (labelName !== config.label_name) return
    if (!config.enabled) {
      app.log.info('Label added, but no action taken because config is disabled.')
      return
    }

    await mergeBranchIntoStaging(context)
    if (config.comment) {
      const commentBody = `I see you added the "${config.label_name}" label, I'll get this merged to the staging branch!`
      await addComment(commentBody, context)
    }
    app.log.debug('merged and commented')
  })

  app.on(['issue_comment.created', 'issue_comment.edited'], async context => {
    const message = context.payload.comment.body
    if (message.match(/\Amerge to stag((ing)|e)\z/i)) {
      const config = await loadConfig(context)

      if (!config.enabled) {
        app.log.info('Comment observed, but no action taken because config is disabled.')
        return
      }

      await mergeBranchIntoStaging(context)
      await addLabel(context, config.label_name)
      if (config.comment) { await addComment("I'll get this merged to the staging branch!", context) }
    }
  })

  app.on('pull_request.synchronize', async context => {
    const config = await loadConfig(context)
    if (!config.enabled) return
    if (await pullRequestHasLabel(context, config.label_name)) {
      await mergeBranchIntoStaging(context)
    }
  })

  async function loadConfig (context) {
    return context.config('merge-bot.yml', defaultConfig)
  }

  async function pullRequestHasLabel (context, labelName) {
    const { data: labels } = await context.github.issues.listLabelsOnIssue(
      context.issue()
    )
    for (const l of labels) {
      if (l.name === labelName) {
        return true
      }
    }
  }

  async function mergeBranchIntoStaging (context) {
    app.log.debug('attempting to merge branch into staging')
    const { data: prDetails } = await context.github.pulls.get(context.issue())
    const mergePayload = context.repo({
      base: 'staging',
      head: prDetails.head.ref
    })
    await context.github.repos.merge(mergePayload).catch(async error => {
      await mergeError(error, context)
    })
  }

  async function addLabel (context, labelName) {
    const addLabelPayload = context.issue({ labels: [labelName] })
    return context.github.issues.addLabels(addLabelPayload)
  }

  async function addComment (message, context) {
    app.log.debug(`attempting to add comment: ${message}`)
    const pullRequestComment = context.issue({ body: message })
    const { data: result } = await context.github.issues.createComment(pullRequestComment)
      .catch(error => { app.log.error(`error posting comment: ${error}`) })
    app.log.debug(`comment creation result: ${result.url}`)
    return result
  }

  async function mergeError (error, context) {
    if (error.message === 'Merge conflict') {
      await addComment(
        'Merge conflict attempting to merge this into staging. Please fix manually.',
        context
      )
    } else {
      app.log.error(`issue merging branch: ${error}`)
    }
  }
}
