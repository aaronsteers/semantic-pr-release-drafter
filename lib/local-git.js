const { execSync } = require('node:child_process')
const { log } = require('./log')
const { parseSemanticCommit } = require('./semantic-commits')

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
 * When a baseRef is provided, uses git ancestry (REF..HEAD) to find commits since that ref.
 * This is more reliable than timestamp-based filtering, especially in CI environments
 * where commits may be created in the same second.
 * @param {Object} options
 * @param {string} options.localGitRoot - Path to the local git repository root
 * @param {string} [options.baseRef] - Optional git ref to get commits since (uses git ancestry)
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

  if (baseRef) {
    // Use git log REF..HEAD for reliable commit ancestry filtering
    // This is more reliable than timestamp-based filtering, especially when
    // commits are created in the same second (common in CI environments)
    gitLogCommand = `git log ${baseRef}..HEAD ${gitLogFormat}`
    if (context) {
      log({
        context,
        message: `Getting commits since ref ${baseRef} using git ancestry`,
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

  // Parse commits from git log output and create mock PRs linked to each commit
  const commits = lines.map((line) => {
    const [id, message, authorName, committedDate] = line.split('|')

    // Extract PR number from commit message if present (e.g., "feat: add feature (#123)")
    const prMatch = message.match(/\(#(\d+)\)\s*$/)
    const prNumber = prMatch ? Number.parseInt(prMatch[1], 10) : ''

    // Remove the PR reference from the message if present
    const messageWithoutPr = prMatch
      ? message.replace(/\s*\(#\d+\)\s*$/, '')
      : message

    // Parse the semantic commit to extract just the description
    // This ensures the title doesn't include the type prefix (e.g., "feat: ")
    const parsedResults = parseSemanticCommit(messageWithoutPr)
    const title =
      parsedResults.length > 0 ? parsedResults[0].description : messageWithoutPr

    // Create a mock PR object linked to this commit
    // Mark as merged so fromCommits() can find it via associatedPullRequests.nodes.find(p => p.merged)
    const mockPr = {
      title,
      number: prNumber,
      body: '',
      url: '',
      baseRefName: '',
      headRefName: '',
      author: { login: authorName, url: '', __typename: 'User' },
      commitSha: id,
      merged: true, // Mark as merged so fromCommits() can find it
    }

    return {
      id,
      message,
      committedDate,
      author: {
        name: authorName,
        user: null,
      },
      associatedPullRequests: {
        nodes: [mockPr], // Link the mock PR to this commit
      },
    }
  })

  // Also return the mock PRs separately for backward compatibility
  const pullRequests = commits.map(
    (commit) => commit.associatedPullRequests.nodes[0]
  )

  if (context) {
    log({ context, message: `Found ${commits.length} commits from local git` })
  }

  return { commits, pullRequests }
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
