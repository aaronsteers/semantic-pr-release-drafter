const compareVersions = require('compare-versions')
const regexEscape = require('escape-string-regexp')
const core = require('@actions/core')

const { getVersionInfo } = require('./versions')
const { template } = require('./template')
const { log } = require('./log')
const {
  resolveVersionBumpFromCommits,
  ReleaseChangeLineItems,
} = require('./semantic-commits')

const sortReleases = (releases, tagPrefix) => {
  // For semver, we find the greatest release number
  // For non-semver, we use the most recently merged
  const tagPrefixRexExp = new RegExp(`^${regexEscape(tagPrefix)}`)
  return releases.sort((r1, r2) => {
    try {
      return compareVersions(
        r1.tag_name.replace(tagPrefixRexExp, ''),
        r2.tag_name.replace(tagPrefixRexExp, '')
      )
    } catch {
      return new Date(r1.created_at) - new Date(r2.created_at)
    }
  })
}

// GitHub API currently returns a 500 HTTP response if you attempt to fetch over 1000 releases.
const RELEASE_COUNT_LIMIT = 1000

const findReleases = async ({
  context,
  targetCommitish,
  filterByCommitish,
  includePreReleases,
  tagPrefix,
}) => {
  let releaseCount = 0
  let releases = await context.octokit.paginate(
    context.octokit.repos.listReleases.endpoint.merge(
      context.repo({
        per_page: 100,
      })
    ),
    (response, done) => {
      releaseCount += response.data.length
      if (releaseCount >= RELEASE_COUNT_LIMIT) {
        done()
      }
      return response.data
    }
  )

  log({ context, message: `Found ${releases.length} releases` })

  // `refs/heads/branch` and `branch` are the same thing in this context
  const headRefRegex = /^refs\/heads\//
  const targetCommitishName = targetCommitish.replace(headRefRegex, '')
  const commitishFilteredReleases = filterByCommitish
    ? releases.filter(
        (r) =>
          targetCommitishName === r.target_commitish.replace(headRefRegex, '')
      )
    : releases
  const filteredReleases = tagPrefix
    ? commitishFilteredReleases.filter((r) => r.tag_name.startsWith(tagPrefix))
    : commitishFilteredReleases
  const sortedSelectedReleases = sortReleases(
    filteredReleases.filter(
      (r) => !r.draft && (!r.prerelease || includePreReleases)
    ),
    tagPrefix
  )
  const draftRelease = filteredReleases.find(
    (r) => r.draft && r.prerelease === includePreReleases
  )
  const lastRelease = sortedSelectedReleases[sortedSelectedReleases.length - 1]

  if (draftRelease) {
    log({ context, message: `Draft release: ${draftRelease.tag_name}` })
  } else {
    log({ context, message: `No draft release found` })
  }

  if (lastRelease) {
    log({
      context,
      message: `Last release${
        includePreReleases ? ' (including prerelease)' : ''
      }: ${lastRelease.tag_name}`,
    })
  } else {
    log({ context, message: `No last release found` })
  }

  return { draftRelease, lastRelease }
}

const contributorsSentence = ({ commits, pullRequests, config }) => {
  const { 'exclude-contributors': excludeContributors } = config

  const contributors = new Set()

  for (const commit of commits) {
    if (commit.author.user) {
      if (!excludeContributors.includes(commit.author.user.login)) {
        contributors.add(`@${commit.author.user.login}`)
      }
    } else {
      contributors.add(commit.author.name)
    }
  }

  for (const pullRequest of pullRequests) {
    if (
      pullRequest.author &&
      !excludeContributors.includes(pullRequest.author.login)
    ) {
      if (pullRequest.author.__typename === 'Bot') {
        contributors.add(
          `[${pullRequest.author.login}[bot]](${pullRequest.author.url})`
        )
      } else {
        contributors.add(`@${pullRequest.author.login}`)
      }
    }
  }

  const sortedContributors = [...contributors].sort()
  if (sortedContributors.length > 1) {
    return (
      sortedContributors.slice(0, -1).join(', ') +
      ' and ' +
      sortedContributors.slice(-1)
    )
  } else if (sortedContributors.length === 1) {
    return sortedContributors[0]
  } else {
    return config['no-contributors-template']
  }
}

const generateChangeLog = (mergedPullRequests, commits, config, context) => {
  // Use ReleaseChangeLineItems for commit-based changelog generation
  // This provides proper categorization based on semantic commit types
  const changeItems = ReleaseChangeLineItems.fromCommits(commits)
  return changeItems.renderWithConfig(config, context)
}

const resolveVersionKeyIncrement = (
  commits,
  config,
  isPreRelease,
  lastRelease
) => {
  const versionResolver = config['version-resolver'] || {}
  const preOneZeroMinorForBreaking =
    versionResolver['pre-one-zero-minor-for-breaking'] !== false
  const noAutoMajor = versionResolver['no-auto-major'] !== false

  let currentMajor = 0
  if (lastRelease && lastRelease.tag_name) {
    const match = lastRelease.tag_name.match(/v?(\d+)/)
    if (match) {
      currentMajor = Number.parseInt(match[1], 10)
    }
  }

  const versionKeyIncrement = resolveVersionBumpFromCommits(commits, {
    preOneZeroMinorForBreaking,
    noAutoMajor,
    currentMajor,
  })

  core.debug('versionKeyIncrement: ' + versionKeyIncrement)

  const shouldIncrementAsPrerelease =
    isPreRelease && config['prerelease-identifier']

  if (!shouldIncrementAsPrerelease) {
    return versionKeyIncrement
  }

  return `pre${versionKeyIncrement}`
}

const generateReleaseInfo = ({
  context,
  commits,
  config,
  lastRelease,
  mergedPullRequests,
  version,
  tag,
  name,
  isPreRelease,
  latest,
  shouldDraft,
  targetCommitish,
}) => {
  const { owner, repo } = context.repo()

  let body = config['header'] + config.template + config['footer']
  body = template(
    body,
    {
      $PREVIOUS_TAG: lastRelease ? lastRelease.tag_name : '',
      $CHANGES: generateChangeLog(mergedPullRequests, commits, config, context),
      $CONTRIBUTORS: contributorsSentence({
        commits,
        pullRequests: mergedPullRequests,
        config,
      }),
      $OWNER: owner,
      $REPOSITORY: repo,
    },
    config.replacers
  )

  const versionKeyIncrement = resolveVersionKeyIncrement(
    commits,
    config,
    isPreRelease,
    lastRelease
  )

  core.info(`Version bump type: ${versionKeyIncrement}`)

  const versionInfo = getVersionInfo(
    lastRelease,
    config['version-template'],
    // Use the first override parameter to identify
    // a version, from the most accurate to the least
    version || tag || name,
    versionKeyIncrement,
    config['tag-prefix'],
    config['prerelease-identifier']
  )

  if (versionInfo && versionInfo.$RESOLVED_VERSION) {
    core.info(`Calculated version: ${versionInfo.$RESOLVED_VERSION.version}`)
  }

  if (versionInfo) {
    body = template(body, versionInfo)
  }

  if (tag === undefined) {
    tag = versionInfo ? template(config['tag-template'] || '', versionInfo) : ''
  } else if (versionInfo) {
    tag = template(tag, versionInfo)
  }

  core.debug('tag: ' + tag)

  if (name === undefined) {
    name = versionInfo
      ? template(config['name-template'] || '', versionInfo)
      : ''
  } else if (versionInfo) {
    name = template(name, versionInfo)
  }

  core.debug('name: ' + name)

  // Tags are not supported as `target_commitish` by Github API.
  // GITHUB_REF or the ref from webhook start with `refs/tags/`, so we handle
  // those here. If it doesn't but is still a tag - it must have been set
  // explicitly by the user, so it's fair to just let the API respond with an error.
  if (targetCommitish.startsWith('refs/tags/')) {
    log({
      context,
      message: `${targetCommitish} is not supported as release target, falling back to default branch`,
    })
    targetCommitish = ''
  }

  let resolvedVersion = versionInfo.$RESOLVED_VERSION.version
  let majorVersion = versionInfo.$RESOLVED_VERSION.$MAJOR
  let minorVersion = versionInfo.$RESOLVED_VERSION.$MINOR
  let patchVersion = versionInfo.$RESOLVED_VERSION.$PATCH

  // Debug: Log generated release draft
  core.info(`Generated release draft:`)
  core.info(`  Tag: ${tag}`)
  core.info(`  Name: ${name}`)
  core.info(`  Version: ${resolvedVersion}`)
  core.info(`--- Release Body Start ---`)
  core.info(body)
  core.info(`--- Release Body End ---`)

  return {
    name,
    tag,
    body,
    targetCommitish,
    prerelease: isPreRelease,
    make_latest: latest,
    draft: shouldDraft,
    resolvedVersion,
    majorVersion,
    minorVersion,
    patchVersion,
  }
}

const createRelease = ({ context, releaseInfo }) => {
  return context.octokit.repos.createRelease(
    context.repo({
      target_commitish: releaseInfo.targetCommitish,
      name: releaseInfo.name,
      tag_name: releaseInfo.tag,
      body: releaseInfo.body,
      draft: releaseInfo.draft,
      prerelease: releaseInfo.prerelease,
      make_latest: releaseInfo.make_latest,
    })
  )
}

const updateRelease = ({ context, draftRelease, releaseInfo }) => {
  const updateReleaseParameters = updateDraftReleaseParameters({
    name: releaseInfo.name || draftRelease.name,
    tag_name: releaseInfo.tag || draftRelease.tag_name,
    target_commitish: releaseInfo.targetCommitish,
  })

  return context.octokit.repos.updateRelease(
    context.repo({
      release_id: draftRelease.id,
      body: releaseInfo.body,
      draft: releaseInfo.draft,
      prerelease: releaseInfo.prerelease,
      make_latest: releaseInfo.make_latest,
      ...updateReleaseParameters,
    })
  )
}

function updateDraftReleaseParameters(parameters) {
  const updateReleaseParameters = { ...parameters }

  // Let GitHub figure out `name` and `tag_name` if undefined
  if (!updateReleaseParameters.name) {
    delete updateReleaseParameters.name
  }
  if (!updateReleaseParameters.tag_name) {
    delete updateReleaseParameters.tag_name
  }

  // Keep existing `target_commitish` if not overriden
  // (sending `null` resets it to the default branch)
  if (!updateReleaseParameters.target_commitish) {
    delete updateReleaseParameters.target_commitish
  }

  return updateReleaseParameters
}

exports.findReleases = findReleases
exports.generateChangeLog = generateChangeLog
exports.generateReleaseInfo = generateReleaseInfo
exports.createRelease = createRelease
exports.updateRelease = updateRelease
