import { Application, Context, ApplicationFunction } from 'probot'
import Webhooks from '@octokit/webhooks'

// const { rollbar } = require('../config/rollbar.js')

interface Config {
  enabled: boolean,
  label_name: string,
  comment: boolean,
  watch_default_branch: boolean
}

export const MergerBot: ApplicationFunction = (app: Application) => {
  const defaultConfig = {
    enabled: false,
    label_name: 'On Staging',
    comment: true,
    watch_default_branch: false
  }

  // app.router.use(rollbar.errorHandler())

  app.log.info('Yay, the app was loaded!')

  app.on('pull_request.labeled', async (context) => {
    const senderType = context.payload.sender.type
    app.log.debug(`New label added by a ${senderType}`)
    if (senderType === 'Bot') return

    const labelPayload = context.payload as (Webhooks.WebhookPayloadPullRequest & { label: { name: string } })
    const labelName = labelPayload.label.name
    const config = (await loadConfig(context)) as Config
    app.log.debug(`New label: ${config.label_name}, Looking for ${labelName}`)
    if (labelName !== config.label_name) return
    if (!config.enabled) {
      app.log.info('Label added, but no action taken because config is disabled.')
      return
    }

    if (config.comment) {
      const commentBody = `I see you added the "${config.label_name}" label, I'll get this merged to the staging branch!`
      await addComment(commentBody, context)
    }
    await mergePRIntoStaging(context)
    app.log.debug('merged and commented')
  })

  app.on(['issue_comment.created', 'issue_comment.edited'], async context => {
    const message = context.payload.comment.body
    if (message.match(/^merge to stag((ing)|e)$/i)) {
      const config = (await loadConfig(context)) as Config

      if (!config.enabled) {
        app.log.info('Comment observed, but no action taken because config is disabled.')
        return
      }

      if (config.comment) { await addComment("I'll get this merged to the staging branch!", context) }
      await mergePRIntoStaging(context)
      await addLabel(context, config.label_name)
    }
  })

  app.on('pull_request.synchronize', async context => {
    const config = (await loadConfig(context)) as Config
    if (!config.enabled) return
    if (await pullRequestHasLabel(context, config.label_name)) {
      await mergePRIntoStaging(context)
    }
  })

  app.on('push', async context => {
    const config = (await loadConfig(context)) as Config
    if (!config.enabled || !config.watch_default_branch) return
    const defaultBranch = context.payload.repository.default_branch
    if (context.payload.ref !== `refs/${defaultBranch}`) return
    app.log.debug(`attempting to merge ${defaultBranch} into staging`)
    await mergeIntoStaging(context, defaultBranch)
  })

  async function loadConfig(context: Context) {
    return context.config('merge-bot.yml', defaultConfig)
  }

  async function pullRequestHasLabel(context: Context, labelName: string): Promise<boolean> {
    const { data: labels } = await context.github.issues.listLabelsOnIssue(
      context.issue()
    )
    for (const l of labels) {
      if (l.name === labelName) {
        return true
      }
    }
    return false
  }

  async function mergePRIntoStaging (context: Context) {
    app.log.debug('attempting to merge PR into staging')
    const { data: prDetails } = await context.github.pulls.get(context.issue())
    await mergeIntoStaging(context, prDetails.head.ref).catch(async error => {
      await mergeError(error, context)
    })
  }

  async function mergeIntoStaging (context: Context, head: string) {
    const mergePayload = context.repo({
      base: 'staging',
      head: head
    })
    await context.github.repos.merge(mergePayload)
  }

  async function addLabel(context: Context, labelName: string) {
    const addLabelPayload = context.issue({ labels: [labelName] })
    return context.github.issues.addLabels(addLabelPayload)
  }

  async function addComment(message: string, context: Context) {
    app.log.debug(`attempting to add comment: ${message}`)
    const pullRequestComment = context.issue({ body: message })
    const response = await context.github.issues.createComment(pullRequestComment)
      .catch(error => { app.log.error(`error posting comment: ${error}`) })
    if (response === undefined) {
      return false
    }
    const result = response.data
    app.log.debug(`comment creation result: ${result.url}`)
    return result
  }

  async function mergeError(error: { message: string }, context: Context) {
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
