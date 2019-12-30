/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
  const STAGING_LABEL = "On Staging"

  // Your code here
  app.log("Yay, the app was loaded!");

  app.on("pull_request.labeled", async context => {
    const senderType = context.payload.sender.type;
    const labelName = context.payload.label.name;

    if (senderType == "Bot") {
      return;
    }
    if (labelName != STAGING_LABEL) {
      return;
    }

    const commentBody = `I see you added the "${labelName}" label, I'll get this merged to the staging branch!`;
    mergeBranchIntoStaging(context);
    return addComment(commentBody, context);
  });

  app.on(["issue_comment.created", "issue_comment.edited"], async context => {
    const message = context.payload.comment.body;
    if (message.match(/merge to stag((ing)|e)/i)) {
      mergeBranchIntoStaging(context);
      addTag(context);
      addComment("I'll get this merged to the staging branch!", context);
    }
  });

  app.on("pull_request.synchronize", async context => {
    if (await pullRequestHasTag(context)) {
      mergeBranchIntoStaging(context);
    }
  });

  async function pullRequestHasTag(context) {
    const labels = await context.github.issues.listLabelsOnIssue(
      context.issue()
    );
    for (const l of labels.data) {
      if (l.name == STAGING_LABEL) {
        return true;
      }
    }
  }

  async function mergeBranchIntoStaging(context) {
    const prDetails = await context.github.pulls.get(context.issue());
    const prBranch = prDetails.data.head.ref;
    const mergePayload = context.repo({ base: "staging", head: prBranch });
    context.github.repos.merge(mergePayload);
  }

  function addTag(context) {
    const addLabelPayload = context.issue({ labels: [STAGING_LABEL] });
    context.github.issues.addLabels(addLabelPayload);
  }

  function addComment(message, context) {
    const pullRequestComment = context.issue({ body: message });
    return context.github.issues.createComment(pullRequestComment);
  }

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
