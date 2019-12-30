/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
  // Your code here
  app.log("Yay, the app was loaded!");

  app.on("pull_request.labeled", async context => {
    // console.log(context);
    const senderType = context.payload.sender.type;
    const labelName = context.payload.label.name;

    if (senderType == "Bot") {
      return;
    }
    if (labelName != "On Staging") {
      return;
    }

    const commentBody = `I see you added the ${labelName} label, I'll get this merged to the staging branch!`;
    return addComment(commentBody, context);
  });

  app.on(["issue_comment.created", "issue_comment.edited"], async context => {
    const message = context.payload.comment.body;
    console.log(`Received this comment: ${message}`);

    if (message.match(/merge to stag((ing)|e)/i)) {
      mergeBranchIntoStaging();
      addTag(context);
      const commentBody = `I'll get this merged to the staging branch!`;
      addComment(commentBody, context);
    }
  });

  function mergeBranchIntoStaging() {}

  function addTag(context) {
    const addLabelPayload = context.issue({ labels: ["On Staging"] });
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
