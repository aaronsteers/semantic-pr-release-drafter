const { getConfig } = require('./lib/config')
const { isTriggerableReference } = require('./lib/triggerable-reference')
const {
  findReleases,
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
const { manageReleaseAssets, resolveFiles } = require('./lib/assets')
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

    const targetCommitish = config.commitish || ref

    const {
      'filter-by-commitish': filterByCommitish,
      'include-pre-releases': includePreReleases,
      'prerelease-identifier': preReleaseIdentifier,
      'tag-prefix': tagPrefix,
      latest,
      prerelease,
    } = config

    const shouldIncludePreReleases = Boolean(
      includePreReleases || preReleaseIdentifier
    )

    const { localGitRoot, baseRefOverride, baseVersionOverride } = input

    // Local git mode: use git log instead of GitHub API
    let draftRelease, lastRelease, commits, mergedPullRequests

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

    const { shouldDraft, version, tag, name, dryRun, attachFiles } = input

    // Version preservation: use draft release version as floor if no explicit version input
    // This ensures we never bump backwards from a human-set draft version
    let effectiveVersion = version
    if (!effectiveVersion && draftRelease) {
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
          // Use versionWithoutPrefix (not draftVersionStr) to avoid double-prefixing
          // since generateReleaseInfo() will add the tag prefix when creating the tag
          effectiveVersion = versionWithoutPrefix
          log({
            context,
            message: `Using draft release version as floor: ${versionWithoutPrefix}`,
          })

          // Warn if draft prerelease is behind the last published release
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
      version: effectiveVersion,
      tag,
      name,
      isPreRelease: prerelease,
      latest,
      shouldDraft,
      targetCommitish,
    })

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
        setDryRunOutput(releaseInfo)
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

    if (attachFiles) {
      log({ context, message: 'Managing release assets...' })
      await manageReleaseAssets({
        context,
        releaseId,
        attachFilesInput: attachFiles,
      })
    }

    if (runnerIsActions()) {
      setActionOutput(createOrUpdateReleaseResponse, releaseInfo)
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
  { body, resolvedVersion, majorVersion, minorVersion, patchVersion }
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
  core.setOutput('body', body)
}

/**
 * Set outputs for dry-run mode (no release created/updated)
 */
function setDryRunOutput({
  body,
  resolvedVersion,
  majorVersion,
  minorVersion,
  patchVersion,
  tag,
  name,
}) {
  if (resolvedVersion) core.setOutput('resolved-version', resolvedVersion)
  if (majorVersion) core.setOutput('major-version', majorVersion)
  if (minorVersion) core.setOutput('minor-version', minorVersion)
  if (patchVersion) core.setOutput('patch-version', patchVersion)
  if (tag) core.setOutput('tag-name', tag)
  if (name) core.setOutput('name', name)
  core.setOutput('body', body)
}
