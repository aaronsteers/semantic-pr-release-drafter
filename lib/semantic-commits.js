const regexEscape = require('escape-string-regexp')
const { template } = require('./template')
const core = require('@actions/core')

// Regex to parse semantic commit messages
// Groups: 1=type, 2=scope (optional), 3=breaking indicator (optional), 4=description, 5=PR number (optional)
// The PR number pattern (e.g., "(#123)") is captured separately to exclude it from the description
// Test and debug this regex at: https://regex101.com/r/0IlkP2/1
const SEMANTIC_COMMIT_REGEX =
  /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+?)(?:\s*\(#(\d+)\))?$/

/**
 * Available title post-processors that can be applied to change titles.
 */
const TITLE_POST_PROCESSORS = {
  'sentence-case': (title) => {
    if (!title || title.length === 0) return title
    return title.charAt(0).toUpperCase() + title.slice(1)
  },
}

/**
 * Apply a list of post-processors to a title string.
 * @param {string} title - The title to process
 * @param {string[]} processors - Array of processor names to apply
 * @returns {string} - The processed title
 */
const applyTitlePostProcessors = (title, processors = []) => {
  let result = title
  for (const processorName of processors) {
    const processor = TITLE_POST_PROCESSORS[processorName]
    if (processor) {
      result = processor(result)
    }
  }
  return result
}

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
    author,
  }) {
    this.type = type
    this.scope = scope || null
    this.description = description
    this.breaking = breaking
    this.raw = raw
    this.commitSha = commitSha || null
    this.prNumber = prNumber || null
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

/**
 * Collection class for managing a list of ReleaseChangeLineItem objects.
 * Provides aggregation methods for version bump calculation, categorization, and filtering.
 */
class ReleaseChangeLineItems {
  constructor(items = []) {
    this.items = items
  }

  /**
   * Create a ReleaseChangeLineItems collection from raw commits.
   * @param {Array} commits - Array of commit objects with message, id, associatedPullRequests
   * @returns {ReleaseChangeLineItems} - Collection of change line items
   */
  static fromCommits(commits) {
    const items = []

    for (const commit of commits) {
      const parsedResults = parseSemanticCommit(commit.message)
      const pr = commit.associatedPullRequests?.nodes?.find((p) => p.merged)

      // Normalize author to string (GitHub API returns object with login, local git returns string)
      let author = null
      if (pr?.author) {
        author = typeof pr.author === 'string' ? pr.author : pr.author.login
      }

      for (const parsed of parsedResults) {
        // Use PR number from associated PR, or fall back to PR number parsed from commit message
        const prNumber = pr?.number || parsed.prNumberFromCommit
        const item = new ReleaseChangeLineItem({
          type: parsed.type,
          scope: parsed.scope,
          description: parsed.description,
          breaking: parsed.breaking,
          raw: parsed.raw,
          commitSha: commit.oid,
          prNumber,
          author,
        })
        items.push(item)

        // Debug: Log parsed change item with all attributes
        core.info(`  Parsed change item: ${JSON.stringify(item)}`)
      }
    }

    return new ReleaseChangeLineItems(items)
  }

  get length() {
    return this.items.length
  }

  /**
   * Check if the collection has any breaking changes.
   * @returns {boolean}
   */
  get hasBreakingChanges() {
    return this.items.some((item) => item.breaking)
  }

  /**
   * Check if the collection has any features.
   * @returns {boolean}
   */
  get hasFeatures() {
    return this.items.some((item) => item.type === 'feat')
  }

  /**
   * Get all breaking change items.
   * @returns {ReleaseChangeLineItems}
   */
  getBreakingChanges() {
    return new ReleaseChangeLineItems(
      this.items.filter((item) => item.breaking)
    )
  }

  /**
   * Get items by type.
   * @param {string} type - Commit type (feat, fix, etc.)
   * @returns {ReleaseChangeLineItems}
   */
  getByType(type) {
    return new ReleaseChangeLineItems(
      this.items.filter((item) => item.type === type)
    )
  }

  /**
   * Resolve the version bump based on all items in the collection.
   * @param {Object} config - Version resolution config
   * @param {boolean} config.preOneZeroMinorForBreaking - Bump minor for breaking changes pre-1.0
   * @param {boolean} config.noAutoMajor - Never auto-bump major version
   * @param {number} config.currentMajor - Current major version number
   * @returns {string} - Version bump type (major, minor, patch)
   */
  resolveVersionBump(config = {}) {
    const {
      preOneZeroMinorForBreaking = true,
      noAutoMajor = true,
      currentMajor = 0,
    } = config

    let maxBump = 'patch'

    if (this.hasBreakingChanges) {
      if (currentMajor === 0 && preOneZeroMinorForBreaking) {
        maxBump = 'minor'
      } else if (noAutoMajor) {
        maxBump = 'minor'
      } else {
        maxBump = 'major'
      }
    } else if (this.hasFeatures) {
      maxBump = 'minor'
    }

    return maxBump
  }

  /**
   * Categorize items by commit type.
   * @returns {Object} - Object with categories and uncategorized arrays
   */
  categorizeByType() {
    const categories = {}

    for (const typeKey of Object.keys(COMMIT_TYPES)) {
      categories[typeKey] = {
        ...COMMIT_TYPES[typeKey],
        type: typeKey,
        items: [],
      }
    }

    const uncategorized = []

    for (const item of this.items) {
      if (categories[item.type]) {
        categories[item.type].items.push(item)
      } else {
        uncategorized.push(item)
      }
    }

    return { categories, uncategorized }
  }

  /**
   * Filter items using a predicate function.
   * @param {Function} predicate - Filter function
   * @returns {ReleaseChangeLineItems}
   */
  filter(predicate) {
    return new ReleaseChangeLineItems(
      this.items.filter((item) => predicate(item))
    )
  }

  /**
   * Map items using a transform function.
   * @param {Function} transform - Transform function
   * @returns {Array}
   */
  map(transform) {
    return this.items.map((item) => transform(item))
  }

  /**
   * Iterate over items.
   * @param {Function} callback - Callback function
   */
  forEach(callback) {
    for (const item of this.items) {
      callback(item)
    }
  }

  /**
   * Make the collection iterable.
   */
  [Symbol.iterator]() {
    return this.items[Symbol.iterator]()
  }

  /**
   * Convert to plain array.
   * @returns {ReleaseChangeLineItem[]}
   */
  toArray() {
    return [...this.items]
  }

  /**
   * Render the collection as a changelog body using the provided config.
   * @param {Object} config - Release drafter config
   * @param {string} config['change-template'] - Template for each change line
   * @param {string} config['category-template'] - Template for category headers
   * @param {Array} config.categories - Array of category definitions with title and commit-types
   * @param {string} config['no-changes-template'] - Template when no changes
   * @param {string} config['change-title-escapes'] - Characters to escape in titles
   * @returns {string} - Rendered changelog body
   */
  renderWithConfig(config, context = null) {
    if (this.items.length === 0) {
      return config['no-changes-template'] || '* No changes'
    }

    const categories = config.categories || []
    const categoryTemplate = config['category-template'] || '## $TITLE'
    const changeTemplate = config['change-template'] || '* $TITLE'
    const escapeChars = config['change-title-escapes'] || ''
    const repoInfo = context ? context.repo() : { owner: '', repo: '' }

    // Group items by category
    const categorizedItems = categories.map((cat) => ({
      ...cat,
      items: [],
    }))
    const uncategorized = []

    for (const item of this.items) {
      let found = false
      for (const cat of categorizedItems) {
        const commitTypes = cat['commit-types'] || []
        // Match by commit type, or match breaking changes when category has 'breaking' type
        const matchesType = commitTypes.includes(item.type)
        const matchesBreaking =
          item.breaking && commitTypes.includes('breaking')
        if (matchesType || matchesBreaking) {
          cat.items.push(item)
          found = true
          break
        }
      }
      if (!found) {
        uncategorized.push(item)
      }
    }

    // Helper to escape title
    const escapeTitle = (title) => {
      if (!escapeChars) return title
      return title.replace(
        new RegExp(`[${regexEscape(escapeChars)}]|\`.*?\``, 'g'),
        (match) => {
          if (match.length > 1) return match
          if (match === '@' || match === '#') return `${match}<!---->`
          return `\\${match}`
        }
      )
    }

    // Helper to render a single item
    const renderItem = (item) => {
      const prNumber = item.prNumber || ''
      // Always apply sentence-case to titles
      const processedTitle = TITLE_POST_PROCESSORS['sentence-case'](
        item.description
      )
      return template(changeTemplate, {
        $TITLE: escapeTitle(processedTitle),
        $NUMBER: prNumber,
        $AUTHOR: item.author || 'ghost',
        $SHA: item.shortSha || '',
        $URL:
          prNumber && repoInfo.owner && repoInfo.repo
            ? `https://github.com/${repoInfo.owner}/${repoInfo.repo}/pull/${prNumber}`
            : '',
      })
    }

    // Build the changelog
    const changeLog = []

    // Add uncategorized first
    if (uncategorized.length > 0) {
      changeLog.push(
        uncategorized.map((item) => renderItem(item)).join('\n') + '\n\n'
      )
    }

    // Add categorized items
    let addedCategories = 0
    for (const category of categorizedItems) {
      if (category.items.length === 0) continue

      // Add separator between categories (but not before first)
      if (addedCategories > 0) {
        changeLog.push('\n\n')
      }

      // Add category header
      const header = template(categoryTemplate, { $TITLE: category.title })
      changeLog.push(header + '\n\n')

      // Handle collapse-after: if item count exceeds threshold, collapse ALL items
      const collapseAfter = category['collapse-after'] || 0
      const shouldCollapse =
        collapseAfter > 0 && category.items.length > collapseAfter

      // Render all items
      const allItems = category.items.map((item) => renderItem(item)).join('\n')

      if (shouldCollapse) {
        // Collapse ALL items in a <details> block
        const itemCount = category.items.length
        const summaryText =
          itemCount === 1 ? '1 change' : `${itemCount} changes`
        changeLog.push(
          `<details>\n<summary>${summaryText}</summary>\n\n${allItems}\n</details>`
        )
      } else {
        // No collapsing, render all items normally
        changeLog.push(allItems)
      }

      addedCategories++
    }

    return changeLog.join('').trim()
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

    // Groups: 1=type, 2=scope (optional), 3=breaking indicator (optional), 4=description, 5=PR number (optional)
    const [, type, scope, breaking, description, prNumberFromCommit] = match
    const lowerType = type.toLowerCase()

    if (!COMMIT_TYPES[lowerType]) continue

    const hasBreakingChange = breaking === '!' || hasBreakingChangeInBody

    results.push({
      type: lowerType,
      scope: scope || null,
      description: description.trim(),
      breaking: hasBreakingChange,
      raw: trimmedLine,
      prNumberFromCommit: prNumberFromCommit
        ? Number.parseInt(prNumberFromCommit, 10)
        : null,
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

    // Normalize author to string (GitHub API returns object with login, local git returns string)
    let author = null
    if (pr?.author) {
      author = typeof pr.author === 'string' ? pr.author : pr.author.login
    }

    for (const parsed of parsedResults) {
      // Use PR number from associated PR, or fall back to PR number parsed from commit message
      const prNumber = pr?.number || parsed.prNumberFromCommit
      changeItems.push(
        new ReleaseChangeLineItem({
          type: parsed.type,
          scope: parsed.scope,
          description: parsed.description,
          breaking: parsed.breaking,
          raw: parsed.raw,
          commitSha: commit.oid,
          prNumber,
          author,
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
exports.TITLE_POST_PROCESSORS = TITLE_POST_PROCESSORS
exports.applyTitlePostProcessors = applyTitlePostProcessors
exports.ReleaseChangeLineItem = ReleaseChangeLineItem
exports.ReleaseChangeLineItems = ReleaseChangeLineItems
exports.parseSemanticCommit = parseSemanticCommit
exports.parseCommitsToChangeItems = parseCommitsToChangeItems
exports.getCommitCategory = getCommitCategory
exports.getCommitCategories = getCommitCategories
exports.resolveVersionBumpFromChangeItems = resolveVersionBumpFromChangeItems
exports.resolveVersionBumpFromCommits = resolveVersionBumpFromCommits
exports.categorizeChangeItemsByType = categorizeChangeItemsByType
exports.categorizeCommitsByType = categorizeCommitsByType
