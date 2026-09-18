const semver = require('semver')
const regexEscape = require('escape-string-regexp')
const core = require('@actions/core')

const parseVersionSuffix = ({ branch, suffix }) => {
  const normalizedSuffix = suffix?.replace(/^v/, '')
  if (!normalizedSuffix || !/^\d+(?:\.\d+){0,2}$/.test(normalizedSuffix)) {
    throw new Error(
      `Release branch "${branch}" has an invalid version suffix "${suffix}".`
    )
  }

  const versionParts = normalizedSuffix.split('.')
  while (versionParts.length < 3) versionParts.push('0')
  const version = semver.parse(versionParts.join('.'))
  if (!version || version.prerelease.length > 0 || version.build.length > 0) {
    throw new Error(
      `Release branch "${branch}" has an invalid release version "${suffix}".`
    )
  }
  return version.version
}

const parseReleaseBranch = ({ ref, rules }) => {
  const branch = (ref || '').replace(/^refs\/heads\//, '')
  for (const rule of rules || []) {
    if (rule['branch-prefix']) {
      const prefix = rule['branch-prefix']
      if (!branch.startsWith(prefix)) continue
      const suffix = branch.slice(prefix.length)
      const version = parseVersionSuffix({ branch, suffix })
      return {
        rule,
        identifier: rule['prerelease-identifier'],
        version,
      }
    }

    const pattern = new RegExp(rule['branch-pattern'])
    const match = pattern.exec(branch)
    if (!match) continue
    const version = parseVersionSuffix({
      branch,
      suffix: match.groups.version,
    })
    return {
      rule,
      identifier: rule['prerelease-identifier'],
      version,
    }
  }
  return null
}

const stripReleaseTagPrefix = ({ tagName, tagPrefix }) => {
  if (tagPrefix) {
    return tagName.startsWith(tagPrefix)
      ? tagName.slice(tagPrefix.length)
      : null
  }
  return tagName
}

const releaseTagPattern = ({ tagPrefix, version, identifier }) =>
  new RegExp(
    identifier
      ? `^${tagPrefix ? regexEscape(tagPrefix) : 'v?'}${regexEscape(
          version
        )}-${regexEscape(identifier)}\\.(\\d+)$`
      : `^${tagPrefix ? regexEscape(tagPrefix) : 'v?'}${regexEscape(version)}$`
  )

const findReleaseBranchPullRequests = ({ pullRequests, rules }) => {
  const matches = []
  const branches = new Set()
  for (const pullRequest of pullRequests || []) {
    if (!pullRequest.merged) continue
    try {
      const parsed = parseReleaseBranch({
        ref: pullRequest.headRefName,
        rules,
      })
      if (!parsed) continue
      const branchKey = `${rules.indexOf(parsed.rule)}:${parsed.version}`
      if (branches.has(branchKey)) continue
      branches.add(branchKey)
      matches.push({ number: pullRequest.number, ...parsed })
    } catch (error) {
      core.warning(error.message)
    }
  }
  return matches
}

module.exports = {
  parseReleaseBranch,
  releaseTagPattern,
  stripReleaseTagPrefix,
  findReleaseBranchPullRequests,
}
