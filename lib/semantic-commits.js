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

/**
 * Represents a single change line item parsed from a semantic commit.
 * Each commit message can produce zero or more ReleaseChangeLineItem instances.
 */
class ReleaseChangeLineItem {
  constructor({
    type,
    scope,
    description,
    breaking,
    raw,
    commitSha,
    prNumber,
    prUrl,
    author,
  }) {
    this.type = type
    this.scope = scope || null
    this.description = description
    this.breaking = breaking
    this.raw = raw
    this.commitSha = commitSha || null
    this.prNumber = prNumber || null
    this.prUrl = prUrl || null
    this.author = author || null
  }

  get category() {
    return COMMIT_TYPES[this.type] || null
  }

  get categoryTitle() {
    return this.category?.title || 'Other'
  }

  get bump() {
    if (this.breaking) return 'major'
    return this.category?.bump || 'patch'
  }

  get shortSha() {
    return this.commitSha ? this.commitSha.slice(0, 7) : null
  }
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

/**
 * Parse all commits into a flat list of ReleaseChangeLineItem instances.
 * This is the primary entry point for converting raw commits to change items.
 * @param {Array} commits - Array of commit objects with message, id, associatedPullRequests
 * @returns {ReleaseChangeLineItem[]} - Flat array of change line items
 */
const parseCommitsToChangeItems = (commits) => {
  const changeItems = []

  for (const commit of commits) {
    const parsedResults = parseSemanticCommit(commit.message)

    const pr = commit.associatedPullRequests?.nodes?.find((p) => p.merged)

    for (const parsed of parsedResults) {
      changeItems.push(
        new ReleaseChangeLineItem({
          type: parsed.type,
          scope: parsed.scope,
          description: parsed.description,
          breaking: parsed.breaking,
          raw: parsed.raw,
          commitSha: commit.id,
          prNumber: pr?.number,
          prUrl: pr?.url,
          author: pr?.author,
        })
      )
    }
  }

  return changeItems
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

/**
 * Resolve version bump from pre-parsed change items.
 * @param {ReleaseChangeLineItem[]} changeItems - Pre-parsed change items
 * @param {Object} config - Version resolution config
 * @returns {string} - Version bump type (major, minor, patch)
 */
const resolveVersionBumpFromChangeItems = (changeItems, config = {}) => {
  const {
    preOneZeroMinorForBreaking = true,
    noAutoMajor = true,
    currentMajor = 0,
  } = config

  let maxBump = 'patch'
  const hasBreaking = changeItems.some((item) => item.breaking)
  const hasFeature = changeItems.some((item) => item.type === 'feat')

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

/**
 * @deprecated Use parseCommitsToChangeItems + resolveVersionBumpFromChangeItems instead
 */
const resolveVersionBumpFromCommits = (commits, config = {}) => {
  const changeItems = parseCommitsToChangeItems(commits)
  return resolveVersionBumpFromChangeItems(changeItems, config)
}

/**
 * Categorize pre-parsed change items by commit type.
 * @param {ReleaseChangeLineItem[]} changeItems - Pre-parsed change items
 * @returns {Object} - Categories with change items grouped by type
 */
const categorizeChangeItemsByType = (changeItems) => {
  const categories = {}

  for (const typeKey of Object.keys(COMMIT_TYPES)) {
    categories[typeKey] = {
      ...COMMIT_TYPES[typeKey],
      type: typeKey,
      items: [],
    }
  }

  const uncategorized = []

  for (const item of changeItems) {
    if (categories[item.type]) {
      categories[item.type].items.push(item)
    } else {
      uncategorized.push(item)
    }
  }

  return { categories, uncategorized }
}

/**
 * @deprecated Use parseCommitsToChangeItems + categorizeChangeItemsByType instead
 */
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
exports.ReleaseChangeLineItem = ReleaseChangeLineItem
exports.parseSemanticCommit = parseSemanticCommit
exports.parseCommitsToChangeItems = parseCommitsToChangeItems
exports.getCommitCategory = getCommitCategory
exports.getCommitCategories = getCommitCategories
exports.resolveVersionBumpFromChangeItems = resolveVersionBumpFromChangeItems
exports.resolveVersionBumpFromCommits = resolveVersionBumpFromCommits
exports.categorizeChangeItemsByType = categorizeChangeItemsByType
exports.categorizeCommitsByType = categorizeCommitsByType
