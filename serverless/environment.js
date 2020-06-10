'use strict'

module.exports = () => {
  // Use dotenv to load local development overrides
  require('dotenv').config()
  return {
    ENVIRONMENT: process.env.ENVIRONMENT || 'development',
    ROLLBAR_ACCESS_TOKEN: process.env.ROLLBAR_ACCESS_TOKEN || '',
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME || '',
    CLOUDSEARCH_DOMAIN_ARN: process.env.CLOUDSEARCH_DOMAIN_ARN || '',
    CLOUDSEARCH_DOCUMENT_ENDPOINT: process.env.CLOUDSEARCH_DOCUMENT_ENDPOINT || ''
  }
}
