const webpack = require('webpack')
const slsw = require('serverless-webpack')
const nodeExternals = require('webpack-node-externals')
const RollbarSourceMapPlugin = require('rollbar-sourcemap-webpack-plugin')
const childProcess = require('child_process')

function git (command) {
  return childProcess.execSync(`git ${command}`, { encoding: 'utf8' }).trim()
}

module.exports = (async () => {
  const version = git('rev-parse --short HEAD')
  return {
    entry: slsw.lib.entries,
    target: 'node',
    devtool: 'hidden-source-map',
    externals: [nodeExternals()],
    mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
    performance: {
      hints: false
    },
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx']
    },
    module: {
      rules: [
        {
          // Include ts, tsx, js, and jsx files.
          test: /\.(ts|js)x?$/,
          exclude: /node_modules/,
          use: [
            'babel-loader'
          ]
        }
      ]
    },
    plugins: [
      new webpack.EnvironmentPlugin({
        SOURCEMAP_VERSION: version
      }),
      process.env.CI
        ? new RollbarSourceMapPlugin({
            accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
            ignoreErrors: true,
            publicPath: '/var/task',
            version: version
          })
        : false
    ].filter(Boolean)
  }
})()
