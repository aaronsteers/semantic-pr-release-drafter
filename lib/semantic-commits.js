const SEMANTIC_COMMIT_REGEX = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/

const COMMIT_TYPES = {
  feat: { title: 'Features', bump: 'minor' },
  fix: { title: 'Bug Fixes', bump: 'patch' },
  docs: { title: 'Documentation', bump: 'patch' },
  style: { title: 'Styles', bump: 'patch' },
  refactor: { title: 'Code Refactoring', bump: 'patch' },
  perf: { title: 'Performance Improvements', bump: 'patch' },
  test: { title: 'Tests', bump: 'patch' },
  build: { title: 'Build System', bump: 'patch' },
  ci: { title: 'Continuous Integration', bump: 'patch' },
  chore: { title: 'Chores', bump: 'patch' },
  revert: { title: 'Reverts', bump: 'patch' },
}

const parseSemanticCommit = (message) => {
  if (!message) return []

  const lines = message.split('\n')
  const results = []
  const hasBreakingChangeInBody = message.includes('BREAKING CHANGE:')

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    const match = trimmedLine.match(SEMANTIC_COMMIT_REGEX)
    if (!match) continue

    const [, type, scope, breaking, description] = match
    const lowerType = type.toLowerCase()

    if (!COMMIT_TYPES[lowerType]) continue

    const hasBreakingChange = breaking === '!' || hasBreakingChangeInBody

    results.push({
      type: lowerType,
      scope: scope || null,
      description: description.trim(),
      breaking: hasBreakingChange,
      raw: trimmedLine,
    })
  }

  return results
}

const getCommitCategory = (parsedCommit) => {
  if (!parsedCommit || Array.isArray(parsedCommit)) return null
  return COMMIT_TYPES[parsedCommit.type] || null
}

const getCommitCategories = (parsedCommits) => {
  if (!parsedCommits || !Array.isArray(parsedCommits)) return []
  return parsedCommits
    .map((parsed) => COMMIT_TYPES[parsed.type])
    .filter(Boolean)
}

const resolveVersionBumpFromCommits = (commits, config = {}) => {
  const {
    preOneZeroMinorForBreaking = true,
    noAutoMajor = true,
    currentMajor = 0,
  } = config

  let maxBump = 'patch'
  let hasBreaking = false
  let hasFeature = false

  for (const commit of commits) {
    const parsedResults = parseSemanticCommit(commit.message)
    for (const parsed of parsedResults) {
      if (parsed.breaking) {
        hasBreaking = true
      }

      if (parsed.type === 'feat') {
        hasFeature = true
      }
    }
  }

  if (hasBreaking) {
    if (currentMajor === 0 && preOneZeroMinorForBreaking) {
      maxBump = 'minor'
    } else if (noAutoMajor) {
      maxBump = 'minor'
    } else {
      maxBump = 'major'
    }
  } else if (hasFeature) {
    maxBump = 'minor'
  }

  return maxBump
}

const categorizeCommitsByType = (commits) => {
  const categories = {}

  for (const typeKey of Object.keys(COMMIT_TYPES)) {
    categories[typeKey] = {
      ...COMMIT_TYPES[typeKey],
      type: typeKey,
      commits: [],
    }
  }

  const uncategorized = []

  for (const commit of commits) {
    const parsedResults = parseSemanticCommit(commit.message)
    if (parsedResults.length === 0) {
      uncategorized.push(commit)
      continue
    }

    for (const parsed of parsedResults) {
      if (categories[parsed.type]) {
        categories[parsed.type].commits.push({
          ...commit,
          parsed,
        })
      } else {
        uncategorized.push(commit)
      }
    }
  }

  return { categories, uncategorized }
}

exports.SEMANTIC_COMMIT_REGEX = SEMANTIC_COMMIT_REGEX
exports.COMMIT_TYPES = COMMIT_TYPES
exports.parseSemanticCommit = parseSemanticCommit
exports.getCommitCategory = getCommitCategory
exports.getCommitCategories = getCommitCategories
exports.resolveVersionBumpFromCommits = resolveVersionBumpFromCommits
exports.categorizeCommitsByType = categorizeCommitsByType
