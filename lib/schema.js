const _ = require('lodash')
const Joi = require('joi')
const { SORT_BY, SORT_DIRECTIONS } = require('./sort-pull-requests')
const { DEFAULT_CONFIG } = require('./default-config')
const { validateReplacers } = require('./template')
const merge = require('deepmerge')

const schema = (context) => {
  const defaultBranch = _.get(
    context,
    'payload.repository.default_branch',
    'master'
  )
  return Joi.object()
    .keys({
      references: Joi.array().items(Joi.string()).default([defaultBranch]),

      'change-template': Joi.string().default(
        DEFAULT_CONFIG['change-template']
      ),

      'change-title-escapes': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['change-title-escapes']),

      'no-changes-template': Joi.string().default(
        DEFAULT_CONFIG['no-changes-template']
      ),

      'version-template': Joi.string().default(
        DEFAULT_CONFIG['version-template']
      ),

      'name-template': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['name-template']),

      'tag-prefix': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['tag-prefix']),

      'tag-template': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['tag-template']),

      'include-paths': Joi.array()
        .items(Joi.string())
        .default(DEFAULT_CONFIG['include-paths']),

      'exclude-contributors': Joi.array()
        .items(Joi.string())
        .default(DEFAULT_CONFIG['exclude-contributors']),

      'no-contributors-template': Joi.string().default(
        DEFAULT_CONFIG['no-contributors-template']
      ),

      'sort-by': Joi.string()
        .valid(SORT_BY.mergedAt, SORT_BY.title)
        .default(DEFAULT_CONFIG['sort-by']),

      'sort-direction': Joi.string()
        .valid(SORT_DIRECTIONS.ascending, SORT_DIRECTIONS.descending)
        .default(DEFAULT_CONFIG['sort-direction']),

      prerelease: Joi.boolean().default(DEFAULT_CONFIG.prerelease),

      'prerelease-identifier': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['prerelease-identifier']),

      latest: Joi.string()
        .allow('', 'true', 'false', 'legacy')
        .default(DEFAULT_CONFIG.latest),

      'filter-by-commitish': Joi.boolean().default(
        DEFAULT_CONFIG['filter-by-commitish']
      ),

      'include-pre-releases': Joi.boolean().default(
        DEFAULT_CONFIG['include-pre-releases']
      ),

      commitish: Joi.string().allow('').default(DEFAULT_CONFIG['commitish']),

      'pull-request-limit': Joi.number()
        .positive()
        .integer()
        .default(DEFAULT_CONFIG['pull-request-limit']),

      replacers: Joi.array()
        .items(
          Joi.object().keys({
            search: Joi.string()
              .required()
              .error(
                new Error(
                  '"search" is required and must be a regexp or a string'
                )
              ),
            replace: Joi.string().allow('').required(),
          })
        )
        .default(DEFAULT_CONFIG.replacers),

      categories: Joi.array()
        .items(
          Joi.object().keys({
            title: Joi.string().required(),
            'collapse-after': Joi.number().integer().min(0).default(0),
            'commit-types': Joi.array()
              .items(Joi.string())
              .single()
              .default([]),
            'commit-scopes': Joi.array()
              .items(Joi.string())
              .single()
              .default([]),
          })
        )
        .default(DEFAULT_CONFIG.categories),

      'version-resolver': Joi.object()
        .keys({
          'pre-one-zero-minor-for-breaking': Joi.boolean().default(
            DEFAULT_CONFIG['version-resolver'][
              'pre-one-zero-minor-for-breaking'
            ]
          ),
          'no-auto-major': Joi.boolean().default(true),
          default: Joi.string()
            .valid('major', 'minor', 'patch')
            .default('patch'),
        })
        .default(DEFAULT_CONFIG['version-resolver']),

      'category-template': Joi.string()
        .allow('')
        .default(DEFAULT_CONFIG['category-template']),

      header: Joi.string().allow('').default(DEFAULT_CONFIG.header),

      template: Joi.string().required(),

      footer: Joi.string().allow('').default(DEFAULT_CONFIG.footer),

      _extends: Joi.string(),
    })
    .rename('branches', 'references', {
      ignoreUndefined: true,
      override: true,
    })
}

const validateSchema = (context, repoConfig) => {
  // Use custom merge options to replace arrays instead of concatenating them
  // This ensures user-provided categories replace defaults rather than being appended
  // Only replace if the source array is non-empty (i.e., user explicitly provided values)
  const mergeOptions = {
    arrayMerge: (destinationArray, sourceArray) =>
      sourceArray.length > 0 ? sourceArray : destinationArray,
  }
  const mergedRepoConfig = merge.all([DEFAULT_CONFIG, repoConfig], mergeOptions)
  const { error, value: config } = schema(context).validate(mergedRepoConfig, {
    abortEarly: false,
    allowUnknown: true,
  })

  if (error) throw error

  try {
    config.replacers = validateReplacers({
      context,
      replacers: config.replacers,
    })
  } catch {
    config.replacers = []
  }

  return config
}

exports.schema = schema
exports.validateSchema = validateSchema
