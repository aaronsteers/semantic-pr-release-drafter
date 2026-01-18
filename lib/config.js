const core = require('@actions/core')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('yaml')
const Table = require('cli-table3')
const { validateSchema } = require('./schema')
const { log } = require('./log')
const { runnerIsActions } = require('./utils')

const DEFAULT_CONFIG_NAME = 'release-drafter.yml'

async function getConfig({ context, configName, localGitRoot }) {
  try {
    let repoConfig

    // In local git mode, read config from local filesystem
    if (localGitRoot) {
      const configPath = path.join(
        localGitRoot,
        '.github',
        configName || DEFAULT_CONFIG_NAME
      )
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8')
        repoConfig = yaml.parse(configContent)
        log({
          context,
          message: `Loaded config from local filesystem: ${configPath}`,
        })
      } else {
        const name = configName || DEFAULT_CONFIG_NAME
        throw new Error(
          `Configuration file ${configPath} is not found in local git root.`
        )
      }
    } else {
      // Standard mode: fetch config from GitHub API
      repoConfig = await context.config(configName || DEFAULT_CONFIG_NAME, null)
      if (repoConfig == null) {
        const name = configName || DEFAULT_CONFIG_NAME
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(
          `Configuration file .github/${name} is not found. The configuration file must reside in your default branch.`
        )
      }
    }

    const config = validateSchema(context, repoConfig)

    return config
  } catch (error) {
    log({ context, error, message: 'Invalid config file' })

    if (error.isJoi) {
      log({
        context,
        message:
          'Config validation errors, please fix the following issues in ' +
          (configName || DEFAULT_CONFIG_NAME) +
          ':\n' +
          joiValidationErrorsAsTable(error),
      })
    }

    if (runnerIsActions()) {
      core.setFailed('Invalid config file')
    }
    return null
  }
}

function joiValidationErrorsAsTable(error) {
  const table = new Table({ head: ['Property', 'Error'] })
  for (const { path, message } of error.details) {
    const prettyPath = path
      .map((pathPart) =>
        Number.isInteger(pathPart) ? `[${pathPart}]` : pathPart
      )
      .join('.')
    table.push([prettyPath, message])
  }
  return table.toString()
}

exports.getConfig = getConfig
