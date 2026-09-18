const {
  parseReleaseBranch,
  releaseTagMatcher,
  releaseTrackBaseMatcher,
  stripReleaseTagPrefix,
  findReleaseBranchPullRequests,
} = require('../lib/release-branches')

describe('release branches', () => {
  const rules = [
    { 'branch-prefix': 'release-candidate/', 'prerelease-identifier': 'rc' },
  ]

  describe('parseReleaseBranch', () => {
    test.each([
      ['refs/heads/release-candidate/v1.0.0', '1.0.0'],
      ['release-candidate/v1.0.0', '1.0.0'],
      ['release-candidate/v1', '1.0.0'],
      ['release-candidate/v1.2', '1.2.0'],
    ])('parses %s', (ref, version) => {
      expect(parseReleaseBranch({ ref, rules })).toEqual({
        rule: rules[0],
        identifier: 'rc',
        version,
      })
    })

    test('returns null for an unknown prefix', () => {
      expect(parseReleaseBranch({ ref: 'other/v1.0.0', rules })).toBeNull()
    })

    test.each(['release-candidate/v1.0.0-rc.1', 'release-candidate/foo1'])(
      'throws for invalid suffix %s',
      (ref) => {
        expect(() => parseReleaseBranch({ ref, rules })).toThrow(
          `Release branch "${ref}" has an invalid version suffix`
        )
      }
    )

    test('supports a prefix with a trailing v', () => {
      expect(
        parseReleaseBranch({
          ref: 'release-candidate/v1.2.3',
          rules: [
            {
              'branch-prefix': 'release-candidate/v',
              'prerelease-identifier': 'rc',
            },
          ],
        })
      ).toMatchObject({ version: '1.2.3' })
    })

    test('parses a regex rule with a named version group', () => {
      expect(
        parseReleaseBranch({
          ref: 'refs/heads/rc-v1.2',
          rules: [
            {
              'branch-pattern': '^rc-v(?<version>\\d+(\\.\\d+){0,2})$',
              'prerelease-identifier': 'rc',
            },
          ],
        })
      ).toMatchObject({ version: '1.2.0' })
    })

    test('stable rule returns no prerelease identifier', () => {
      expect(
        parseReleaseBranch({
          ref: 'release/v2',
          rules: [{ 'branch-prefix': 'release/' }],
        })
      ).toMatchObject({ version: '2.0.0', identifier: undefined })
    })
  })

  test('matches release tags above the branch floor', () => {
    const matcher = releaseTagMatcher({
      tagPrefix: '',
      version: '1.0.0',
      identifier: 'rc',
    })
    expect(matcher('v1.0.2-rc.0')).toBe(true)
    expect(matcher('v1.0.0-rc.3')).toBe(true)
    expect(matcher('v2.0.0-rc.0')).toBe(false)
    expect(matcher('v1.0.0-beta.1')).toBe(false)
    expect(matcher('v1.0.0')).toBe(false)
    expect(matcher('v0.9.0-rc.1')).toBe(false)

    const packageMatcher = releaseTagMatcher({
      tagPrefix: 'package-a/v',
      version: '1.0.0',
      identifier: 'rc',
    })
    expect(packageMatcher('package-a/v1.0.0-rc.2')).toBe(true)
    expect(packageMatcher('v1.0.0-rc.9')).toBe(false)
  })

  test('matches stable tags above the branch floor', () => {
    const matcher = releaseTagMatcher({
      tagPrefix: '',
      version: '1.0.0',
    })
    expect(matcher('v1.0.1')).toBe(true)
    expect(matcher('v1.0.0')).toBe(true)
    expect(matcher('v1.0.0-rc.1')).toBe(false)
  })

  test('matches release-track tags and stable tags at or below the track major', () => {
    const matcher = releaseTrackBaseMatcher({
      tagPrefix: '',
      version: '1.0.0',
      identifier: 'rc',
    })
    expect(matcher('v1.0.0-rc.3')).toBe(true)
    expect(matcher('v1.0.1')).toBe(true)
    expect(matcher('v1.5.0')).toBe(true)
    expect(matcher('v2.0.0')).toBe(false)
    expect(matcher('v2.0.1-rc.0')).toBe(false)
    expect(matcher('v1.0.0-beta.1')).toBe(false)
    expect(matcher('v0.9.0')).toBe(true)
  })

  test('matches stable tags with a required release tag prefix', () => {
    const matcher = releaseTrackBaseMatcher({
      tagPrefix: 'foo-',
      version: '1.0.0',
      identifier: 'rc',
    })
    expect(matcher('foo-v1.0.1')).toBe(true)
    expect(matcher('bar-v1.0.1')).toBe(false)
  })

  test('matches numeric prerelease identifiers', () => {
    const matcher = releaseTagMatcher({
      tagPrefix: '',
      version: '1.0.0',
      identifier: '123',
    })
    expect(matcher('v1.0.0-123.1')).toBe(true)
  })

  test('strips a required release tag prefix', () => {
    expect(
      stripReleaseTagPrefix({
        tagName: 'package-a/v1.0.0',
        tagPrefix: 'package-a/v',
      })
    ).toBe('1.0.0')
    expect(
      stripReleaseTagPrefix({
        tagName: 'v1.0.0',
        tagPrefix: 'package-a/v',
      })
    ).toBeNull()
  })

  test('filters merged pull requests and deduplicates versions', () => {
    const pullRequests = [
      { number: 1, merged: true, headRefName: 'release-candidate/v1' },
      { number: 2, merged: true, headRefName: 'release-candidate/v1.0.0' },
      { number: 3, merged: false, headRefName: 'release-candidate/v2' },
      { number: 4, merged: true, headRefName: 'other/v2' },
      { number: 5, merged: true, headRefName: 'release-candidate/foo' },
    ]
    expect(findReleaseBranchPullRequests({ pullRequests, rules })).toEqual([
      {
        number: 1,
        rule: rules[0],
        identifier: 'rc',
        version: '1.0.0',
      },
    ])
  })

  test('keeps same-version branches with different prefixes distinct', () => {
    expect(
      findReleaseBranchPullRequests({
        pullRequests: [
          { number: 1, merged: true, headRefName: 'release-candidate/v1' },
          { number: 2, merged: true, headRefName: 'hotfix/v1' },
        ],
        rules: [
          {
            'branch-prefix': 'release-candidate/',
            'prerelease-identifier': 'rc',
          },
          { 'branch-prefix': 'hotfix/', 'prerelease-identifier': 'hotfix' },
        ],
      })
    ).toEqual([
      {
        number: 1,
        rule: {
          'branch-prefix': 'release-candidate/',
          'prerelease-identifier': 'rc',
        },
        identifier: 'rc',
        version: '1.0.0',
      },
      {
        number: 2,
        rule: {
          'branch-prefix': 'hotfix/',
          'prerelease-identifier': 'hotfix',
        },
        identifier: 'hotfix',
        version: '1.0.0',
      },
    ])
  })
})
