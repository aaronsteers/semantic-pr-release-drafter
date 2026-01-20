const semver = require('semver')

const splitSemVersion = (input, versionKey = 'version') => {
  if (!input[versionKey]) {
    return
  }

  const version = input.inc
    ? semver.inc(input[versionKey], input.inc, true, input.preReleaseIdentifier)
    : input[versionKey].version

  const prereleaseVersion = semver.prerelease(version)?.join('.') || ''

  return {
    ...input,
    version,
    $MAJOR: semver.major(version),
    $MINOR: semver.minor(version),
    $PATCH: semver.patch(version),
    $PRERELEASE: prereleaseVersion ? `-${prereleaseVersion}` : '',
    $COMPLETE: version,
  }
}

const defaultVersionInfo = {
  $NEXT_MAJOR_VERSION: {
    version: '1.0.0',
    template: '$MAJOR.$MINOR.$PATCH',
    inputVersion: null,
    versionKeyIncrement: 'patch',
    inc: 'major',
    $MAJOR: 1,
    $MINOR: 0,
    $PATCH: 0,
    $PRERELEASE: '',
  },
  $NEXT_MINOR_VERSION: {
    version: '0.1.0',
    template: '$MAJOR.$MINOR.$PATCH',
    inputVersion: null,
    versionKeyIncrement: 'patch',
    inc: 'minor',
    $MAJOR: 0,
    $MINOR: 1,
    $PATCH: 0,
    $PRERELEASE: '',
  },
  $NEXT_PATCH_VERSION: {
    version: '0.1.0',
    template: '$MAJOR.$MINOR.$PATCH',
    inputVersion: null,
    versionKeyIncrement: 'patch',
    inc: 'patch',
    $MAJOR: 0,
    $MINOR: 1,
    $PATCH: 0,
    $PRERELEASE: '',
  },
  $NEXT_PRERELEASE_VERSION: {
    version: '0.1.0-rc.0',
    template: '$MAJOR.$MINOR.$PATCH$PRERELEASE',
    inputVersion: null,
    versionKeyIncrement: 'prerelease',
    inc: 'prerelease',
    preReleaseIdentifier: 'rc',
    $MAJOR: 0,
    $MINOR: 1,
    $PATCH: 0,
    $PRERELEASE: '-rc.0',
  },
  $INPUT_VERSION: null,
  $RESOLVED_VERSION: {
    version: '0.1.0',
    template: '$MAJOR.$MINOR.$PATCH',
    inputVersion: null,
    versionKeyIncrement: 'patch',
    inc: 'patch',
    $MAJOR: 0,
    $MINOR: 1,
    $PATCH: 0,
    $PRERELEASE: '',
  },
}

const getTemplatableVersion = (input) => {
  const templatableVersion = {
    $NEXT_MAJOR_VERSION: splitSemVersion({ ...input, inc: 'major' }),
    $NEXT_MAJOR_VERSION_MAJOR: splitSemVersion({
      ...input,
      inc: 'major',
      template: '$MAJOR',
    }),
    $NEXT_MAJOR_VERSION_MINOR: splitSemVersion({
      ...input,
      inc: 'major',
      template: '$MINOR',
    }),
    $NEXT_MAJOR_VERSION_PATCH: splitSemVersion({
      ...input,
      inc: 'major',
      template: '$PATCH',
    }),
    $NEXT_MINOR_VERSION: splitSemVersion({ ...input, inc: 'minor' }),
    $NEXT_MINOR_VERSION_MAJOR: splitSemVersion({
      ...input,
      inc: 'minor',
      template: '$MAJOR',
    }),
    $NEXT_MINOR_VERSION_MINOR: splitSemVersion({
      ...input,
      inc: 'minor',
      template: '$MINOR',
    }),
    $NEXT_MINOR_VERSION_PATCH: splitSemVersion({
      ...input,
      inc: 'minor',
      template: '$PATCH',
    }),
    $NEXT_PATCH_VERSION: splitSemVersion({ ...input, inc: 'patch' }),
    $NEXT_PATCH_VERSION_MAJOR: splitSemVersion({
      ...input,
      inc: 'patch',
      template: '$MAJOR',
    }),
    $NEXT_PATCH_VERSION_MINOR: splitSemVersion({
      ...input,
      inc: 'patch',
      template: '$MINOR',
    }),
    $NEXT_PATCH_VERSION_PATCH: splitSemVersion({
      ...input,
      inc: 'patch',
      template: '$PATCH',
    }),
    $NEXT_PRERELEASE_VERSION: splitSemVersion({
      ...input,
      inc: 'prerelease',
      template: '$PRERELEASE',
    }),
    $INPUT_VERSION: splitSemVersion(input, 'inputVersion'),
    $RESOLVED_VERSION: splitSemVersion({
      ...input,
      inc: input.versionKeyIncrement || 'patch',
    }),
  }

  // If inputVersion (explicit user override) exists, it always wins
  if (templatableVersion.$INPUT_VERSION) {
    templatableVersion.$RESOLVED_VERSION = templatableVersion.$INPUT_VERSION
  }

  return templatableVersion
}

const toSemver = (version) => {
  const result = semver.parse(version)
  if (result) {
    return result
  }

  // doesn't handle prerelease
  return semver.coerce(version)
}

const coerceVersion = (input, tagPrefix) => {
  if (!input) {
    return
  }

  const stripTag = (input) =>
    tagPrefix && input.startsWith(tagPrefix)
      ? input.slice(tagPrefix.length)
      : input

  return typeof input === 'object'
    ? toSemver(stripTag(input.tag_name)) || toSemver(stripTag(input.name))
    : toSemver(stripTag(input))
}

const hasPreReleaseTag = (version) => {
  if (!version) return false
  const prerelease = semver.prerelease(version)
  return prerelease && prerelease.length > 0
}

const getVersionInfo = (
  release,
  template,
  inputVersion,
  versionKeyIncrement,
  tagPrefix,
  preReleaseIdentifier,
  draftVersion
) => {
  const version = coerceVersion(release, tagPrefix)
  inputVersion = coerceVersion(inputVersion, tagPrefix)
  draftVersion = coerceVersion(draftVersion, tagPrefix)

  const isPreVersionKeyIncrement = versionKeyIncrement?.startsWith('pre')

  if (!version && !inputVersion && !draftVersion) {
    if (isPreVersionKeyIncrement) {
      defaultVersionInfo['$RESOLVED_VERSION'] = {
        ...defaultVersionInfo['$NEXT_PRERELEASE_VERSION'],
      }
    }

    return defaultVersionInfo
  }

  if (inputVersion && hasPreReleaseTag(inputVersion)) {
    const prereleaseVersion = semver.prerelease(inputVersion)?.join('.') || ''
    return {
      ...getTemplatableVersion({
        version,
        template,
        inputVersion,
        versionKeyIncrement: null,
        preReleaseIdentifier,
      }),
      $INPUT_VERSION: {
        version: inputVersion.version,
        template,
        inputVersion,
        versionKeyIncrement: null,
        $MAJOR: semver.major(inputVersion),
        $MINOR: semver.minor(inputVersion),
        $PATCH: semver.patch(inputVersion),
        $PRERELEASE: prereleaseVersion ? `-${prereleaseVersion}` : '',
        $COMPLETE: inputVersion.version,
      },
      $RESOLVED_VERSION: {
        version: inputVersion.version,
        template,
        inputVersion,
        versionKeyIncrement: null,
        $MAJOR: semver.major(inputVersion),
        $MINOR: semver.minor(inputVersion),
        $PATCH: semver.patch(inputVersion),
        $PRERELEASE: prereleaseVersion ? `-${prereleaseVersion}` : '',
        $COMPLETE: inputVersion.version,
      },
    }
  }

  // If no explicit inputVersion but draftVersion has prerelease tag, preserve it exactly
  if (!inputVersion && draftVersion && hasPreReleaseTag(draftVersion)) {
    const prereleaseVersion = semver.prerelease(draftVersion)?.join('.') || ''
    return {
      ...getTemplatableVersion({
        version,
        template,
        inputVersion: draftVersion,
        versionKeyIncrement: null,
        preReleaseIdentifier,
      }),
      $RESOLVED_VERSION: {
        version: draftVersion.version,
        template,
        inputVersion: draftVersion,
        versionKeyIncrement: null,
        $MAJOR: semver.major(draftVersion),
        $MINOR: semver.minor(draftVersion),
        $PATCH: semver.patch(draftVersion),
        $PRERELEASE: prereleaseVersion ? `-${prereleaseVersion}` : '',
        $COMPLETE: draftVersion.version,
      },
    }
  }

  const shouldIncrementAsPrerelease =
    isPreVersionKeyIncrement && version?.prerelease?.length

  if (shouldIncrementAsPrerelease) {
    versionKeyIncrement = 'prerelease'
  }

  const templatableVersion = getTemplatableVersion({
    version,
    template,
    inputVersion,
    versionKeyIncrement,
    preReleaseIdentifier,
  })

  // If no explicit inputVersion but draftVersion exists, use it as a floor
  // (use the higher of draftVersion vs computed version)
  if (!inputVersion && draftVersion && templatableVersion.$RESOLVED_VERSION) {
    const resolvedVersion = templatableVersion.$RESOLVED_VERSION.version
    const draftVersionStr = draftVersion.version
    if (
      semver.valid(resolvedVersion) &&
      semver.valid(draftVersionStr) &&
      semver.gt(draftVersionStr, resolvedVersion)
    ) {
      // Draft version is higher than computed, use draft as floor
      const prereleaseVersion = semver.prerelease(draftVersion)?.join('.') || ''
      templatableVersion.$RESOLVED_VERSION = {
        version: draftVersionStr,
        template,
        inputVersion: draftVersion,
        versionKeyIncrement: null,
        $MAJOR: semver.major(draftVersion),
        $MINOR: semver.minor(draftVersion),
        $PATCH: semver.patch(draftVersion),
        $PRERELEASE: prereleaseVersion ? `-${prereleaseVersion}` : '',
        $COMPLETE: draftVersionStr,
      }
    }
    // If computed version is higher, keep it (draftVersion acts as floor, not ceiling)
  }

  return templatableVersion
}

exports.getVersionInfo = getVersionInfo
exports.defaultVersionInfo = defaultVersionInfo
