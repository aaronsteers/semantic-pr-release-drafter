const { SORT_BY, SORT_DIRECTIONS } = require('./sort-pull-requests')

const DEFAULT_CATEGORIES = [
  {
    title: '⚠️ Breaking Changes',
    'commit-types': ['breaking'],
    'commit-scopes': [],
    'collapse-after': 0,
    'display-order': null,
  },
  {
    title: '✨ New Features',
    'commit-types': ['feat'],
    'commit-scopes': [],
    'collapse-after': 0,
    'display-order': null,
  },
  {
    title: '🐛 Bug Fixes',
    'commit-types': ['fix'],
    'commit-scopes': [],
    'collapse-after': 0,
    'display-order': null,
  },
  {
    title: '▲ Other Changes',
    'commit-types': ['refactor', 'perf', 'style'],
    'commit-scopes': [],
    'collapse-after': 2,
    'display-order': null,
  },
  {
    title: '📖 Documentation',
    'commit-types': ['docs'],
    'commit-scopes': [],
    'collapse-after': 2,
    'display-order': null,
  },
  {
    title: '⚙️ Under the Hood',
    'commit-types': ['chore', 'ci', 'build', 'test', 'revert', 'infra'],
    'commit-scopes': [],
    'collapse-after': 2,
    'display-order': null,
  },
]

const DEFAULT_TEMPLATE = `$CHANGES

---`

const DEFAULT_FOOTER = `_See also: [Full Release Notes ($RESOLVED_MAJOR_TAG.x family)](https://github.com/$OWNER/$REPOSITORY/releases?q=tag:$RESOLVED_MAJOR_TAG) | [Full Changelog ($PREVIOUS_TAG...$RESOLVED_TAG)](https://github.com/$OWNER/$REPOSITORY/compare/$PREVIOUS_TAG...$RESOLVED_TAG)_`

const DEFAULT_CONFIG = Object.freeze({
  'name-template': 'v$RESOLVED_VERSION',
  'tag-template': 'v$RESOLVED_VERSION',
  'tag-prefix': '',
  'change-template': '* $TITLE ($URL) $SHA',
  'change-title-escapes': '',
  'no-changes-template': '* No changes',
  'version-template': '$MAJOR.$MINOR.$PATCH$PRERELEASE',
  'version-resolver': {
    'pre-one-zero-minor-for-breaking': true,
    'no-auto-major': true,
    default: 'patch',
  },
  template: DEFAULT_TEMPLATE,
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
  'scope-template': '',
  'category-template': '## $TITLE',
  header: '',
  footer: DEFAULT_FOOTER,
})

exports.DEFAULT_CONFIG = DEFAULT_CONFIG
