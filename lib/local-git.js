const { execSync } = require('node:child_process')
const { log } = require('./log')

/**
 * Get the timestamp of a git ref.
 * @param {string} localGitRoot - Path to the local git repository root
 * @param {string} ref - Git ref (tag, branch, or commit SHA)
 * @returns {string|null} ISO timestamp or null if ref not found
 */
const getTimestampFromRef = (localGitRoot, ref) => {
  try {
    const timestamp = execSync(`git log -1 --format=%aI ${ref}`, {
      cwd: localGitRoot,
      encoding: 'utf8',
    }).trim()
    return timestamp
  } catch {
    return null
  }
}

/**
 * Get commits from a local git repository using git log.
 * Commit filtering is timestamp-based: when a baseRef is provided, it is converted
 * to a timestamp internally, and commits are filtered by their commit date.
 * @param {Object} options
 * @param {string} options.localGitRoot - Path to the local git repository root
 * @param {string} [options.baseRef] - Optional git ref to get commits since (converted to timestamp)
 * @param {Object} [options.context] - Optional context for logging
 * @returns {Object} Object containing commits array and empty pullRequests array
 */
const findCommitsFromLocalGit = ({ localGitRoot, baseRef, context }) => {
  if (context) {
    log({
      context,
      message: `Fetching commits from local git repository: ${localGitRoot}`,
    })
  }

  const gitLogFormat = "--format='%H|%s|%an|%aI'"
  let gitLogCommand = `git log ${gitLogFormat}`
  let sinceTimestamp = null

  if (baseRef) {
    sinceTimestamp = getTimestampFromRef(localGitRoot, baseRef)
    if (sinceTimestamp) {
      gitLogCommand = `git log --since="${sinceTimestamp}" ${gitLogFormat}`
      if (context) {
        log({
          context,
          message: `Getting commits since ref ${baseRef} (timestamp: ${sinceTimestamp})`,
        })
      }
    } else if (context) {
      log({
        context,
        message: `Warning: Could not resolve ref ${baseRef}, getting all commits`,
      })
    }
  }

  let output
  try {
    output = execSync(gitLogCommand, {
      cwd: localGitRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    if (context) {
      log({ context, message: `Error running git log: ${error.message}` })
    }
    return { commits: [], pullRequests: [] }
  }

  const lines = output.trim().split('\n').filter(Boolean)

  // Filter out the commit at the exact sinceTimestamp (mirroring GitHub API behavior)
  const commits = lines
    .map((line) => {
      const [id, message, authorName, committedDate] = line.split('|')
      return {
        id,
        message,
        committedDate,
        author: {
          name: authorName,
          user: null,
        },
        associatedPullRequests: {
          nodes: [],
        },
      }
    })
    .filter((commit) => commit.committedDate !== sinceTimestamp)

  if (context) {
    log({ context, message: `Found ${commits.length} commits from local git` })
  }

  return { commits, pullRequests: [] }
}

/**
 * Create a mock lastRelease object from a version string.
 * @param {string} versionString - The version string (e.g., "1.0.0" or "v1.0.0")
 * @param {string} [tagPrefix] - Optional tag prefix (e.g., "v")
 * @returns {Object|null} A mock lastRelease object or null if no version provided
 */
const createMockLastRelease = (versionString, tagPrefix = '') => {
  if (!versionString) {
    return null
  }

  const tagName = versionString.startsWith(tagPrefix)
    ? versionString
    : `${tagPrefix}${versionString}`

  return {
    id: 0,
    tag_name: tagName,
    name: tagName,
    created_at: new Date().toISOString(),
    draft: false,
    prerelease: false,
  }
}

/**
 * Get the tag to use for git log --since when using local git mode.
 * @param {string} baseVersionOverride - The base version override string
 * @param {string} [tagPrefix] - Optional tag prefix
 * @returns {string|null} The tag to use or null
 */
const getTagFromVersion = (baseVersionOverride, tagPrefix = '') => {
  if (!baseVersionOverride) {
    return null
  }

  return baseVersionOverride.startsWith(tagPrefix)
    ? baseVersionOverride
    : `${tagPrefix}${baseVersionOverride}`
}

exports.getTimestampFromRef = getTimestampFromRef
exports.findCommitsFromLocalGit = findCommitsFromLocalGit
exports.createMockLastRelease = createMockLastRelease
exports.getTagFromVersion = getTagFromVersion
