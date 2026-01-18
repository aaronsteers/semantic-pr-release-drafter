const { SORT_BY, SORT_DIRECTIONS } = require('./sort-pull-requests')
const { COMMIT_TYPES } = require('./semantic-commits')

const DEFAULT_CATEGORIES = Object.entries(COMMIT_TYPES).map(
  ([type, { title }]) => ({
    title,
    'collapse-after': 0,
    'commit-types': [type],
  })
)

const DEFAULT_CONFIG = Object.freeze({
  'name-template': '',
  'tag-template': '',
  'tag-prefix': '',
  'change-template': `* $TITLE ($COMMIT) (#$NUMBER) @$AUTHOR`,
  'change-title-escapes': '',
  'no-changes-template': `* No changes`,
  'version-template': `$MAJOR.$MINOR.$PATCH$PRERELEASE`,
  'version-resolver': {
    'pre-one-zero-minor-for-breaking': true,
    'no-auto-major': true,
    default: 'patch',
  },
  categories: DEFAULT_CATEGORIES,
  'include-paths': [],
  'exclude-contributors': [],
  'no-contributors-template': 'No contributors',
  replacers: [],
  'sort-by': SORT_BY.mergedAt,
  'sort-direction': SORT_DIRECTIONS.descending,
  prerelease: false,
  'prerelease-identifier': '',
  'include-pre-releases': false,
  latest: 'true',
  'filter-by-commitish': false,
  commitish: '',
  'pull-request-limit': 5,
  'category-template': `## $TITLE`,
  header: '',
  footer: '',
})

exports.DEFAULT_CONFIG = DEFAULT_CONFIG
