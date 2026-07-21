const { getConfig } = require('./lib/config')
const { isTriggerableReference } = require('./lib/triggerable-reference')
const {
  findReleases,
  getReleaseById,
  generateReleaseInfo,
  createRelease,
  updateRelease,
} = require('./lib/releases')
const { findCommitsWithAssociatedPullRequests } = require('./lib/commits')
const {
  findCommitsFromLocalGit,
  createMockLastRelease,
} = require('./lib/local-git')
const { sortPullRequests } = require('./lib/sort-pull-requests')
const { log } = require('./lib/log')
const core = require('@actions/core')
const { runnerIsActions } = require('./lib/utils')
const {
  manageReleaseAssets,
  resolveFiles,
  deleteAllReleaseAssets,
} = require('./lib/assets')
const { getEffectiveTagPrefix } = require('./lib/tag-prefix')
const semver = require('semver')

module.exports = (app, { getRouter }) => {
  if (!runnerIsActions() && typeof getRouter === 'function') {
    getRouter().get('/healthz', (request, response) => {
      response.status(200).json({ status: 'pass' })
    })
  }

  const drafter = async (context) => {
    const input = getInput()

    const config = await getConfig({
      context,
      configName: input.configName,
      localGitRoot: input.localGitRoot,
    })

    if (!config) return

    updateConfigFromInput(config, input)

    // GitHub Actions merge payloads slightly differ, in that their ref points
    // to the PR branch instead of refs/heads/master
    const ref = process.env['GITHUB_REF'] || context.payload.ref

    if (!isTriggerableReference({ ref, context, config })) {
      return
    }

    let targetCommitish = config.commitish || ref
    const hasExplicitCommitish = Boolean(config.commitish)

    const {
      'filter-by-commitish': filterByCommitish,
      'include-pre-releases': includePreReleases,
      'prerelease-identifier': preReleaseIdentifier,
      latest,
      prerelease,
    } = config
    const tagPrefix = getEffectiveTagPrefix(config)

    const shouldIncludePreReleases = Boolean(
      includePreReleases || preReleaseIdentifier
    )

    const { localGitRoot, baseRefOverride, baseVersionOverride } = input

    // Local git mode: use git log instead of GitHub API
    let draftRelease, lastRelease, commits, mergedPullRequests
    // The concrete, point-in-time commit SHA this run evaluated/pinned to.
    let resolvedSha

    if (localGitRoot) {
      log({
        context,
        message: `Using local git mode with root: ${localGitRoot}`,
      })

      // In local git mode, we don't have a draft release
      draftRelease = null

      // Create mock lastRelease from baseVersionOverride or baseRefOverride
      const baseVersion = baseVersionOverride || baseRefOverride
      lastRelease = baseVersion
        ? createMockLastRelease(baseVersion, tagPrefix)
        : null

      // Get commits from local git
      const localGitResult = findCommitsFromLocalGit({
        localGitRoot,
        baseRef: baseRefOverride,
        includePaths: config['include-paths'],
        context,
      })
      commits = localGitResult.commits
      mergedPullRequests = localGitResult.pullRequests
    } else {
      // Standard GitHub API mode
      const releasesResult = await findReleases({
        context,
        targetCommitish,
        filterByCommitish,
        includePreReleases: shouldIncludePreReleases,
        tagPrefix,
      })
      draftRelease = releasesResult.draftRelease
      lastRelease = releasesResult.lastRelease

      if (input.releaseId) {
        // Durable finalize path: when a `release-id` is supplied (e.g. captured
        // from the `id` output of an earlier `not-ready` invocation), resolve
        // the target release by ID via a strongly consistent point-read. This
        // bypasses list-based draft discovery, which is eventually consistent
        // and can miss a just-created draft — causing a duplicate release.
        const targetedRelease = await getReleaseById({
          context,
          releaseId: input.releaseId,
        })
        if (targetedRelease) {
          draftRelease = targetedRelease
        } else {
          core.warning(
            `release-id "${input.releaseId}" did not resolve to an existing release; ` +
              `falling back to list-based discovery.`
          )
        }
      }

      // Resolve a fixed, point-in-time commit SHA and pin the release to it, so
      // the commit set, version, changelog, and eventual tag all correspond to
      // exactly what this run evaluated — immune to the default branch moving
      // between invocations (e.g. between a `not-ready` pass and its finalize).
      const pinnedSha = resolveTargetSha({
        targetCommitish,
        hasExplicitCommitish,
        filterByCommitish,
        finalizeRelease: input.releaseId ? draftRelease : null,
      })
      if (pinnedSha) {
        resolvedSha = pinnedSha
        targetCommitish = pinnedSha
      }

      const commitsResult = await findCommitsWithAssociatedPullRequests({
        context,
        targetCommitish,
        lastRelease,
        config,
      })
      commits = commitsResult.commits
      mergedPullRequests = commitsResult.pullRequests
    }

    const sortedMergedPullRequests = sortPullRequests(
      mergedPullRequests,
      config['sort-by'],
      config['sort-direction']
    )

    // Debug: Log input commits
    log({ context, message: `Processing ${commits.length} commits` })
    for (const commit of commits) {
      log({
        context,
        message: `  Commit ${commit.id?.slice(0, 7) || 'unknown'}: ${
          commit.message?.split('\n')[0] || 'no message'
        }`,
      })
    }

    // Debug: Log merged pull requests
    log({
      context,
      message: `Processing ${sortedMergedPullRequests.length} merged pull requests`,
    })

    const {
      shouldDraft,
      version,
      tag,
      name,
      dryRun,
      attachFiles,
      resetFiles,
      notReady,
    } = input

    let shouldResetFiles
    if (resetFiles === 'true') {
      shouldResetFiles = true
    } else if (resetFiles === 'false') {
      shouldResetFiles = false
    } else {
      shouldResetFiles = !!attachFiles
    }

    // Separate explicit user input from draft release version:
    // - overrideVersion: explicit user input via action arg (always wins, skips calculations)
    // - draftVersion: extracted from draft release (acts as floor vs computed version)
    const overrideVersion = version
    let draftVersion

    if (draftRelease) {
      const draftVersionStr = draftRelease.tag_name || draftRelease.name
      if (draftVersionStr) {
        // Strip tag prefix if present
        const versionWithoutPrefix =
          tagPrefix && draftVersionStr.startsWith(tagPrefix)
            ? draftVersionStr.slice(tagPrefix.length)
            : draftVersionStr

        // Validate semver - if invalid, warn and ignore (trust humans know what they're doing)
        const parsedVersion = semver.parse(versionWithoutPrefix)
        if (parsedVersion) {
          draftVersion = versionWithoutPrefix
          log({
            context,
            message: `Found draft release version: ${versionWithoutPrefix}`,
          })

          // Warn if draft version is behind the last published release
          if (lastRelease) {
            const lastReleaseVersionStr =
              lastRelease.tag_name || lastRelease.name
            if (lastReleaseVersionStr) {
              const lastVersionWithoutPrefix =
                tagPrefix && lastReleaseVersionStr.startsWith(tagPrefix)
                  ? lastReleaseVersionStr.slice(tagPrefix.length)
                  : lastReleaseVersionStr
              const parsedLastVersion = semver.parse(lastVersionWithoutPrefix)
              if (
                parsedLastVersion &&
                semver.gt(parsedLastVersion, parsedVersion)
              ) {
                core.warning(
                  `Draft release version "${draftVersionStr}" is behind the last published release "${lastReleaseVersionStr}". ` +
                    `Consider advancing the draft to a version greater than ${lastReleaseVersionStr}.`
                )
              }
            }
          }
        } else {
          core.warning(
            `Draft release version "${draftVersionStr}" is not valid semver. ` +
              `Ignoring and computing version from commits.`
          )
        }
      }
    }

    const releaseInfo = generateReleaseInfo({
      context,
      commits,
      config,
      lastRelease,
      mergedPullRequests: sortedMergedPullRequests,
      overrideVersion,
      draftVersion,
      tag,
      name,
      isPreRelease: prerelease,
      latest,
      shouldDraft,
      targetCommitish,
    })

    // Apply not-ready banner when truthy
    if (notReady) {
      const bannerMessage =
        typeof notReady === 'string'
          ? notReady
          : 'This release draft is still being prepared. Do not publish until this banner is removed.'
      releaseInfo.body =
        `> [!CAUTION]\n` +
        `> **NOT READY FOR PUBLISHING**\n` +
        `>\n` +
        `> ${bannerMessage}\n\n` +
        releaseInfo.body
    }

    // Append hidden admin metadata comment (Pacific time + commit link)
    const pacificTimestamp = formatPacificTimestamp(new Date())
    const commitUrl = getCommitUrl()
    releaseInfo.body +=
      `\n<!-- Release drafted at ${pacificTimestamp}` +
      (commitUrl ? ` from ${commitUrl}` : '') +
      ` -->\n`

    // In dry-run mode, skip creating/updating releases but still set outputs
    if (dryRun) {
      log({
        context,
        message: 'Dry-run mode: skipping release creation/update',
      })

      if (attachFiles) {
        const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd()
        log({
          context,
          message: `Dry-run mode: resolving attach-files patterns...`,
        })
        const filesToAttach = await resolveFiles(attachFiles, workspacePath)
        if (filesToAttach.length === 0) {
          core.setFailed(
            'attach-files was specified but no files matched the pattern(s). ' +
              'Please check your glob patterns and ensure the files exist. ' +
              `Patterns: ${attachFiles
                .split('\n')
                .filter((p) => p.trim())
                .join(', ')}`
          )
          return
        } else {
          log({
            context,
            message: `Dry-run mode: Would upload ${filesToAttach.length} file(s):`,
          })
          for (const file of filesToAttach) {
            log({ context, message: `  - ${file}` })
          }
        }
      }

      if (runnerIsActions()) {
        setDryRunOutput(releaseInfo, resolvedSha)
      }
      return
    }

    let createOrUpdateReleaseResponse
    if (!draftRelease) {
      log({ context, message: 'Creating new release' })
      createOrUpdateReleaseResponse = await createRelease({
        context,
        releaseInfo,
        config,
      })
    } else {
      log({ context, message: 'Updating existing release' })
      createOrUpdateReleaseResponse = await updateRelease({
        context,
        draftRelease,
        releaseInfo,
        config,
      })
    }

    const releaseId = createOrUpdateReleaseResponse.data.id

    if (shouldResetFiles === true && !attachFiles) {
      log({
        context,
        message: 'Resetting release assets (reset-files=true)...',
      })
      await deleteAllReleaseAssets({ context, releaseId })
    }

    if (attachFiles) {
      log({ context, message: 'Managing release assets...' })
      await manageReleaseAssets({
        context,
        releaseId,
        attachFilesInput: attachFiles,
        resetFiles: shouldResetFiles,
      })
    }

    if (runnerIsActions()) {
      setActionOutput(createOrUpdateReleaseResponse, releaseInfo, resolvedSha)
    }
  }

  if (runnerIsActions()) {
    app.onAny(drafter)
  } else {
    app.on('push', drafter)
  }
}

function getInput() {
  return {
    configName: core.getInput('config-name'),
    shouldDraft: core.getInput('publish').toLowerCase() !== 'true',
    version: core.getInput('version') || undefined,
    tag: core.getInput('tag') || undefined,
    releaseId: core.getInput('release-id') || undefined,
    name: core.getInput('name') || undefined,
    dryRun: core.getInput('dry-run').toLowerCase() === 'true',
    localGitRoot: core.getInput('local-git-root') || undefined,
    baseRefOverride: core.getInput('base-ref-override') || undefined,
    baseVersionOverride: core.getInput('base-version-override') || undefined,
    commitish: core.getInput('commitish') || undefined,
    header: core.getInput('header') || undefined,
    footer: core.getInput('footer') || undefined,
    prerelease:
      core.getInput('prerelease') !== ''
        ? core.getInput('prerelease').toLowerCase() === 'true'
        : undefined,
    preReleaseIdentifier: core.getInput('prerelease-identifier') || undefined,
    latest: core.getInput('latest')?.toLowerCase() || undefined,
    attachFiles: core.getInput('attach-files') || undefined,
    resetFiles: core.getInput('reset-files').toLowerCase() || 'auto',
    notReady: parseNotReadyInput(core.getInput('not-ready')),
    allowMajorBumps:
      core.getInput('allow-major-bumps') !== ''
        ? core.getInput('allow-major-bumps').toLowerCase() === 'true'
        : undefined,
  }
}

/**
 * Merges the config file with the input
 * the input takes precedence, because it's more easy to change at runtime
 */
function updateConfigFromInput(config, input) {
  if (input.commitish) {
    config.commitish = input.commitish
  }

  if (input.header) {
    config.header = input.header
  }

  if (input.footer) {
    config.footer = input.footer
  }

  if (input.prerelease !== undefined) {
    config.prerelease = input.prerelease
  }

  if (input.preReleaseIdentifier) {
    config['prerelease-identifier'] = input.preReleaseIdentifier
  }

  if (input.allowMajorBumps !== undefined) {
    if (!config['version-resolver']) {
      config['version-resolver'] = {}
    }
    config['version-resolver']['no-auto-major'] = !input.allowMajorBumps
  }

  config.latest = config.prerelease
    ? 'false'
    : input.latest || config.latest || undefined
}

function setActionOutput(
  releaseResponse,
  { body, resolvedVersion, majorVersion, minorVersion, patchVersion },
  resolvedSha
) {
  const {
    data: {
      id: releaseId,
      html_url: htmlUrl,
      upload_url: uploadUrl,
      tag_name: tagName,
      name: name,
    },
  } = releaseResponse
  if (releaseId && Number.isInteger(releaseId))
    core.setOutput('id', releaseId.toString())
  if (htmlUrl) core.setOutput('html-url', htmlUrl)
  if (uploadUrl) core.setOutput('upload-url', uploadUrl)
  if (tagName) core.setOutput('tag-name', tagName)
  if (name) core.setOutput('name', name)
  if (resolvedVersion) core.setOutput('resolved-version', resolvedVersion)
  if (majorVersion) core.setOutput('major-version', majorVersion)
  if (minorVersion) core.setOutput('minor-version', minorVersion)
  if (patchVersion) core.setOutput('patch-version', patchVersion)
  if (resolvedSha) core.setOutput('resolved-sha', resolvedSha)
  core.setOutput('body', body)
}

/**
 * Set outputs for dry-run mode (no release created/updated)
 */
function setDryRunOutput(
  {
    body,
    resolvedVersion,
    majorVersion,
    minorVersion,
    patchVersion,
    tag,
    name,
  },
  resolvedSha
) {
  if (resolvedVersion) core.setOutput('resolved-version', resolvedVersion)
  if (majorVersion) core.setOutput('major-version', majorVersion)
  if (minorVersion) core.setOutput('minor-version', minorVersion)
  if (patchVersion) core.setOutput('patch-version', patchVersion)
  if (tag) core.setOutput('tag-name', tag)
  if (name) core.setOutput('name', name)
  if (resolvedSha) core.setOutput('resolved-sha', resolvedSha)
  core.setOutput('body', body)
}

// A full-length (40 hex) commit SHA.
const FULL_SHA_REGEX = /^[\da-f]{40}$/i

/**
 * Resolves the release target to a fixed, point-in-time commit SHA so the
 * release can be pinned to exactly what this run evaluated (immune to the
 * branch moving between invocations). Resolution order, highest priority first:
 *   1. The finalize target's own `target_commitish`, when a `release-id` pass
 *      resolved a release already pinned to a SHA — reuses the commit frozen by
 *      the earlier invocation so the finalize re-evaluates the same snapshot.
 *   2. `targetCommitish`, when it is itself a SHA (an explicit `commitish` SHA).
 *   3. `GITHUB_SHA` — the exact commit that triggered this run, when it is a
 *      valid 40-hex SHA (i.e. running in GitHub Actions) — but only on the
 *      default path, where it is the tip of the target ref.
 * Returns `undefined` when none apply, leaving the existing ref behavior
 * intact. The auto-pin (case 3) is deliberately skipped when an explicit branch
 * `commitish` is set (opt-out) or when `filter-by-commitish` is enabled — that
 * feature matches releases by branch name, so writing a SHA into
 * `target_commitish` would break selection on later runs.
 */
function resolveTargetSha({
  targetCommitish,
  hasExplicitCommitish,
  filterByCommitish,
  finalizeRelease,
}) {
  const finalizeSha = finalizeRelease && finalizeRelease.target_commitish
  if (finalizeSha && FULL_SHA_REGEX.test(finalizeSha)) {
    return finalizeSha
  }
  if (FULL_SHA_REGEX.test(targetCommitish)) {
    return targetCommitish
  }
  if (
    !hasExplicitCommitish &&
    !filterByCommitish &&
    FULL_SHA_REGEX.test(process.env.GITHUB_SHA || '')
  ) {
    return process.env.GITHUB_SHA
  }
  return
}

/**
 * Parses the `not-ready` action input into a normalized value.
 *
 * Returns:
 * - `false` when the input is empty, undefined, or the string "false"
 * - `true` when the input is the string "true" (use default banner message)
 * - the original string for any other truthy value (custom banner message)
 */
function parseNotReadyInput(raw) {
  if (!raw) return false
  const lower = raw.toLowerCase()
  if (lower === 'false') return false
  if (lower === 'true') return true
  return raw
}

/**
 * Formats a Date as "YYYY-MM-DD h:mmam/pm Pacific" in America/Los_Angeles.
 */
function formatPacificTimestamp(date) {
  const options = {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date)
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = get('hour')
  const minute = get('minute')
  const dayPeriod = get('dayPeriod').toLowerCase()
  return `${year}-${month}-${day} ${hour}:${minute}${dayPeriod} Pacific`
}

/**
 * Builds the commit URL from GitHub Actions environment variables.
 * Returns null when not running in GitHub Actions.
 */
function getCommitUrl() {
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const repository = process.env.GITHUB_REPOSITORY
  const sha = process.env.GITHUB_SHA
  if (!repository || !sha) return null
  return `${serverUrl}/${repository}/commit/${sha}`
}
