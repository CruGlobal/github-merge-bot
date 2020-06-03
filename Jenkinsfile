#!groovy
@Library('jenkins-jobs') _

serverlessPipeline(
  defaultEnvironment: 'production',
  packageManager: 'yarn',
  assumeRole: 'arn:aws:iam::056154071827:role/github-merge-bot-prod-DeployRole'
)
