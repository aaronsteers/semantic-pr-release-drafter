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
      core.warning(
        `Release branch "${branch}" has an invalid version suffix "${suffix}".`
      )
      return null
    }

    const versionParts = suffix.split('.')
    while (versionParts.length < 3) versionParts.push('0')
    const version = versionParts.join('.')
    const parsed = semver.parse(version)
    if (!parsed || parsed.prerelease.length > 0 || parsed.build.length > 0) {
      core.warning(
        `Release branch "${branch}" has an invalid release version "${suffix}".`
      )
      return null
    }

    return { prefix, identifier, version: parsed.version }
  }

  return null
}

const releaseTagPattern = ({ tagPrefix, version, identifier }) =>
  new RegExp(
    `^(?:${regexEscape(tagPrefix || '')})?v?${regexEscape(
      version
    )}-${regexEscape(identifier)}\\.(\\d+)$`
  )

const findReleaseBranchPullRequests = ({ pullRequests, types, tagPrefix }) => {
  const matches = []
  const versions = new Set()
  for (const pullRequest of pullRequests || []) {
    if (!pullRequest.merged) continue
    const parsed = parseReleaseBranch({
      ref: pullRequest.headRefName,
      types,
      tagPrefix,
    })
    if (!parsed || versions.has(parsed.version)) continue
    versions.add(parsed.version)
    matches.push({ number: pullRequest.number, ...parsed })
  }
  return matches
}

module.exports = {
  parseReleaseBranch,
  releaseTagPattern,
  findReleaseBranchPullRequests,
}
