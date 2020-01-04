module.exports = app => {
  const STAGING_LABEL = "On Staging";

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
    debugger;
    if (await pullRequestHasTag(context)) {
      mergeBranchIntoStaging(context);
    }
  });

  async function pullRequestHasTag(context) {
    const { data: labels } = await context.github.issues.listLabelsOnIssue(
      context.issue()
    );
    for (const l of labels) {
      if (l.name == STAGING_LABEL) {
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

  function addTag(context) {
    const addLabelPayload = context.issue({ labels: [STAGING_LABEL] });
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
