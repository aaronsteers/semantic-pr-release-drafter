const core = require('@actions/core')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('yaml')
const Table = require('cli-table3')
const { validateSchema } = require('./schema')
const { log } = require('./log')
const { runnerIsActions } = require('./utils')

const DEFAULT_CONFIG_NAME = 'release-drafter.yml'

function getInlineConfigOverrides() {
  const overrides = {}

  const nameTemplate = core.getInput('name-template')
  if (nameTemplate) {
    overrides['name-template'] = nameTemplate
  }

  const tagTemplate = core.getInput('tag-template')
  if (tagTemplate) {
    overrides['tag-template'] = tagTemplate
  }

  const changeTemplate = core.getInput('change-template')
  if (changeTemplate) {
    overrides['change-template'] = changeTemplate
  }

  const template = core.getInput('template')
  if (template) {
    overrides.template = template
  }

  const categoryTemplate = core.getInput('category-template')
  if (categoryTemplate) {
    overrides['category-template'] = categoryTemplate
  }

  const categoriesYaml = core.getInput('categories')
  if (categoriesYaml) {
    try {
      const categories = yaml.parse(categoriesYaml)
      if (Array.isArray(categories)) {
        overrides.categories = categories
      }
    } catch (error) {
      core.warning(
        `Failed to parse 'categories' input as YAML. This input will be ignored. Error: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  return overrides
}

function hasInlineConfig() {
  return (
    core.getInput('name-template') ||
    core.getInput('tag-template') ||
    core.getInput('change-template') ||
    core.getInput('template') ||
    core.getInput('category-template') ||
    core.getInput('categories')
  )
}

async function getConfig({ context, configName, localGitRoot }) {
  try {
    let repoConfig = {}
    let configFileFound = false

    // In local git mode, read config from local filesystem
    if (localGitRoot) {
      const configPath = path.join(
        localGitRoot,
        '.github',
        configName || DEFAULT_CONFIG_NAME
      )
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8')
        repoConfig = yaml.parse(configContent) || {}
        configFileFound = true
        log({
          context,
          message: `Loaded config from local filesystem: ${configPath}`,
        })
      }
    } else {
      // Standard mode: fetch config from GitHub API
      repoConfig = await context.config(configName || DEFAULT_CONFIG_NAME, null)
      if (repoConfig != null) {
        configFileFound = true
      } else {
        repoConfig = {}
      }
    }

    // If no config file found and no inline config, throw error
    if (!configFileFound && !hasInlineConfig()) {
      const name = configName || DEFAULT_CONFIG_NAME
      throw new Error(
        `Configuration file .github/${name} is not found and no inline config provided. ` +
          `Either create a config file in your default branch or provide inline config inputs.`
      )
    }

    // Apply inline config overrides (inline inputs take precedence over file config)
    const inlineOverrides = getInlineConfigOverrides()
    if (Object.keys(inlineOverrides).length > 0) {
      log({
        context,
        message: `Applying inline config overrides: ${Object.keys(
          inlineOverrides
        ).join(', ')}`,
      })
      repoConfig = { ...repoConfig, ...inlineOverrides }
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
