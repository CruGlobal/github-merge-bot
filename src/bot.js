'use strict'

const { rollbar } = require('../config/rollbar.js');

module.exports = app => {
  const defaultConfig = {
    enabled: false,
    label_name: "On Staging",
    comment: true
  };

  app.router.use(rollbar.errorHandler())

  app.log("Yay, the app was loaded!");

  app.on("pull_request.labeled", async context => {
    const senderType = context.payload.sender.type;
    if (senderType == "Bot") return;

    const labelName = context.payload.label.name;
    const config = await loadConfig(context);
    if (labelName != config.label_name) return;
    if (!config.enabled) {
      app.log("Label added, but no action taken because config is disabled.")
      return;
    }

    mergeBranchIntoStaging(context);
    if (config.comment) {
      const commentBody = `I see you added the "${config.label_name}" label, I'll get this merged to the staging branch!`;
      addComment(commentBody, context);
    }
  });

  app.on(["issue_comment.created", "issue_comment.edited"], async context => {
    const message = context.payload.comment.body;
    if (message.match(/merge to stag((ing)|e)/i)) {
      const config = await loadConfig(context);

      if (!config.enabled) {
        app.log("Comment observed, but no action taken because config is disabled.")
        app.log(message)
        return;
      }

      mergeBranchIntoStaging(context);
      addLabel(context, config.label_name);
      if (config.comment)
        addComment("I'll get this merged to the staging branch!", context);
    }
  });

  app.on("pull_request.synchronize", async context => {
    const config = await loadConfig(context);
    if (!config.enabled) return;
    if (await pullRequestHasLabel(context, config.label_name)) {
      mergeBranchIntoStaging(context);
    }
  });

  async function loadConfig(context) {
    return await context.config("merge-bot.yml", defaultConfig);
  }

  async function pullRequestHasLabel(context, labelName) {
    const { data: labels } = await context.github.issues.listLabelsOnIssue(
      context.issue()
    );
    for (const l of labels) {
      if (l.name == labelName) {
        return true;
      }
    }
  }

  async function mergeBranchIntoStaging(context) {
    const { data: prDetails } = await context.github.pulls.get(context.issue());
    const mergePayload = context.repo({
      base: "staging",
      head: prDetails.head.ref
    });
    context.github.repos.merge(mergePayload).catch(error => {
      mergeError(error, context);
    });
  }

  function addLabel(context, labelName) {
    const addLabelPayload = context.issue({ labels: [labelName] });
    context.github.issues.addLabels(addLabelPayload);
  }

  function addComment(message, context) {
    const pullRequestComment = context.issue({ body: message });
    return context.github.issues.createComment(pullRequestComment);
  }

  function mergeError(error, context) {
    if (error.message == "Merge conflict") {
      addComment(
        "Merge conflict attempting to merge this into staging. Please fix manually.",
        context
      );
    } else {
      app.log(error);
    }
  }
};
