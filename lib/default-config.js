const { SORT_BY, SORT_DIRECTIONS } = require('./sort-pull-requests')

const DEFAULT_CATEGORIES = [
  {
    title: '⚠️ Breaking Changes',
    'commit-types': ['breaking'],
    'collapse-after': 0,
  },
  {
    title: '✨ New Features',
    'commit-types': ['feat'],
    'collapse-after': 0,
  },
  {
    title: '🐛 Bug Fixes',
    'commit-types': ['fix'],
    'collapse-after': 0,
  },
  {
    title: '▲ Other Changes',
    'commit-types': ['refactor', 'perf', 'style'],
    'collapse-after': 2,
  },
  {
    title: '📖 Documentation',
    'commit-types': ['docs'],
    'collapse-after': 2,
  },
  {
    title: '⚙️ Under the Hood',
    'commit-types': ['chore', 'ci', 'build', 'test'],
    'collapse-after': 2,
  },
]

const DEFAULT_TEMPLATE = `$CHANGES

---

**Full Changelog**: https://github.com/$OWNER/$REPOSITORY/compare/$PREVIOUS_TAG...v$RESOLVED_VERSION`

const DEFAULT_CONFIG = Object.freeze({
  'name-template': 'v$RESOLVED_VERSION',
  'tag-template': 'v$RESOLVED_VERSION',
  'tag-prefix': '',
  'change-template': '* $TITLE ($URL) $SHA',
  'change-title-escapes': '',
  'title-post-processors': ['sentence-case'],
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
  'category-template': '## $TITLE',
  header: '',
  footer: '',
})

exports.DEFAULT_CONFIG = DEFAULT_CONFIG
