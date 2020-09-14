const webpack = require('webpack')
const slsw = require('serverless-webpack')
const nodeExternals = require('webpack-node-externals')
const RollbarSourceMapPlugin = require('rollbar-sourcemap-webpack-plugin')
const sourcemapVersion = require('child_process').execSync('git rev-parse --short HEAD').toString().trim()

module.exports = {
  entry: slsw.lib.entries,
  target: 'node',
  devtool: 'source-map',
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
      SOURCEMAP_VERSION: sourcemapVersion
    }),
    new RollbarSourceMapPlugin({
      accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
      publicPath: '/var/task',
      version: sourcemapVersion
    })
  ]
}
