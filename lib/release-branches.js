const semver = require('semver')
const regexEscape = require('escape-string-regexp')
const core = require('@actions/core')

const parseReleaseBranch = ({ ref, types, tagPrefix }) => {
  const branch = (ref || '').replace(/^refs\/heads\//, '')
  for (const [prefix, identifier] of Object.entries(types || {})) {
    if (!branch.startsWith(`${prefix}/`)) continue

    let suffix = branch.slice(prefix.length + 1)
    if (tagPrefix && suffix.startsWith(tagPrefix)) {
      suffix = suffix.slice(tagPrefix.length)
    }
    suffix = suffix.replace(/^v/, '')

    if (!/^\d+(?:\.\d+){0,2}$/.test(suffix)) {
      throw new Error(
        `Release branch "${branch}" has an invalid version suffix "${suffix}".`
      )
    }

    const versionParts = suffix.split('.')
    while (versionParts.length < 3) versionParts.push('0')
    const version = versionParts.join('.')
    const parsed = semver.parse(version)
    if (!parsed || parsed.prerelease.length > 0 || parsed.build.length > 0) {
      throw new Error(
        `Release branch "${branch}" has an invalid release version "${suffix}".`
      )
    }

    return { prefix, identifier, version: parsed.version }
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
    `^${tagPrefix ? regexEscape(tagPrefix) : 'v?'}${regexEscape(
      version
    )}-${regexEscape(identifier)}\\.(\\d+)$`
  )

const findReleaseBranchPullRequests = ({ pullRequests, types, tagPrefix }) => {
  const matches = []
  const branches = new Set()
  for (const pullRequest of pullRequests || []) {
    if (!pullRequest.merged) continue
    try {
      const parsed = parseReleaseBranch({
        ref: pullRequest.headRefName,
        types,
        tagPrefix,
      })
      if (!parsed) continue
      const branchKey = `${parsed.prefix}:${parsed.version}`
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
