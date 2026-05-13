import type { ApplicationFunction, Context, Probot } from 'probot'

interface Config {
  enabled: boolean
  label_name: string
  comment: boolean
  watch_default_branch: boolean
  base_name: string
}

const defaultConfig: Config = {
  enabled: false,
  label_name: 'On Staging',
  comment: true,
  watch_default_branch: false,
  base_name: 'staging',
}

export const MergerBot: ApplicationFunction = (app: Probot) => {
  app.log.info('Merge bot loaded')

  app.on('pull_request.labeled', async (context) => {
    const senderType = context.payload.sender.type
    app.log.debug(`New label added by a ${senderType}`)
    if (senderType === 'Bot') return

    const labelName = context.payload.label?.name
    const config = await loadConfig(context)
    app.log.debug(`New label: ${labelName}, Looking for ${config.label_name}`)
    if (labelName !== config.label_name) return
    if (!config.enabled) {
      app.log.info('Label added, but no action taken because config is disabled.')
      return
    }

    if (config.comment) {
      const commentBody = `I see you added the "${config.label_name}" label, I'll get this merged to the ${config.base_name} branch!`
      await addComment(context, commentBody)
    }
    await mergePRIntoStaging(context, config)
    app.log.debug('merged and commented')
  })

  app.on(['issue_comment.created', 'issue_comment.edited'], async (context) => {
    const message = context.payload.comment.body
    if (!/^merge to stag((ing)|e)$/i.test(message)) return

    const config = await loadConfig(context)
    if (!config.enabled) {
      app.log.info('Comment observed, but no action taken because config is disabled.')
      return
    }

    if (config.comment) {
      await addComment(context, `I'll get this merged to the ${config.base_name} branch!`)
    }
    await mergePRIntoStaging(context, config)
    await addLabel(context, config.label_name)
  })

  app.on('pull_request.synchronize', async (context) => {
    const config = await loadConfig(context)
    if (!config.enabled) return
    if (await pullRequestHasLabel(context, config.label_name)) {
      await mergePRIntoStaging(context, config)
    }
  })

  app.on('push', async (context) => {
    const config = await loadConfig(context)
    if (!config.enabled || !config.watch_default_branch) return
    const defaultBranch = context.payload.repository.default_branch
    if (
      context.payload.ref !== `refs/${defaultBranch}` &&
      context.payload.ref !== `refs/heads/${defaultBranch}`
    ) {
      return
    }
    app.log.debug(`attempting to merge ${defaultBranch} into ${config.base_name}`)
    await mergeIntoStaging(context, defaultBranch, config)
  })

  async function loadConfig(context: Context): Promise<Config> {
    const config = await context.config<Config>('merge-bot.yml', defaultConfig)
    return config ?? defaultConfig
  }

  async function pullRequestHasLabel(context: Context, labelName: string): Promise<boolean> {
    const { data: labels } = await context.octokit.rest.issues.listLabelsOnIssue(context.issue())
    return labels.some((l) => l.name === labelName)
  }

  async function mergePRIntoStaging(context: Context, config: Config): Promise<void> {
    app.log.debug(`attempting to merge PR into ${config.base_name}`)
    const pullNumber = getPullNumber(context)
    const { data: prDetails } = await context.octokit.rest.pulls.get(
      context.repo({ pull_number: pullNumber }),
    )
    try {
      await mergeIntoStaging(context, prDetails.head.ref, config, prDetails.number)
    } catch (error) {
      await mergeError(context, config, error as { message: string })
    }
  }

  function getPullNumber(context: Context): number {
    const payload = context.payload as {
      pull_request?: { number: number }
      issue?: { number: number }
    }
    const number = payload.pull_request?.number ?? payload.issue?.number
    if (number === undefined) throw new Error('No pull/issue number on payload')
    return number
  }

  async function mergeIntoStaging(
    context: Context,
    head: string,
    config: Config,
    prNumber?: number,
  ): Promise<void> {
    const prInfo = prNumber ? ` (PR #${prNumber})` : ''
    const commitMessage = `Merge branch '${head}'${prInfo} into ${config.base_name}`
    await context.octokit.rest.repos.merge(
      context.repo({
        base: config.base_name,
        head,
        commit_message: commitMessage,
      }),
    )
  }

  async function addLabel(context: Context, labelName: string): Promise<void> {
    await context.octokit.rest.issues.addLabels(context.issue({ labels: [labelName] }))
  }

  async function addComment(context: Context, body: string): Promise<void> {
    app.log.debug(`attempting to add comment: ${body}`)
    try {
      await context.octokit.rest.issues.createComment(context.issue({ body }))
    } catch (error) {
      app.log.error(`error posting comment: ${error}`)
    }
  }

  async function mergeError(
    context: Context,
    config: Config,
    error: { message: string },
  ): Promise<void> {
    if (error.message === 'Merge conflict') {
      await addComment(
        context,
        `Merge conflict attempting to merge this into ${config.base_name}. Please fix manually.`,
      )
    } else {
      app.log.error(`issue merging branch: ${error.message}`)
    }
  }
}
