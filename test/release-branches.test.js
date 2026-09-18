const {
  parseReleaseBranch,
  releaseTagPattern,
  stripReleaseTagPrefix,
  findReleaseBranchPullRequests,
} = require('../lib/release-branches')

describe('release branches', () => {
  const types = { 'release-candidate': 'rc' }

  describe('parseReleaseBranch', () => {
    test.each([
      ['refs/heads/release-candidate/v1.0.0', '1.0.0'],
      ['release-candidate/v1.0.0', '1.0.0'],
      ['release-candidate/v1', '1.0.0'],
      ['release-candidate/v1.2', '1.2.0'],
    ])('parses %s', (ref, version) => {
      expect(parseReleaseBranch({ ref, types })).toEqual({
        prefix: 'release-candidate',
        identifier: 'rc',
        version,
      })
    })

    test('returns null for an unknown prefix', () => {
      expect(parseReleaseBranch({ ref: 'other/v1.0.0', types })).toBeNull()
    })

    test.each(['release-candidate/v1.0.0-rc.1', 'release-candidate/foo1'])(
      'throws for invalid suffix %s',
      (ref) => {
        expect(() => parseReleaseBranch({ ref, types })).toThrow(
          `Release branch "${ref}" has an invalid version suffix`
        )
      }
    )

    test('strips a configured tag prefix', () => {
      expect(
        parseReleaseBranch({
          ref: 'release-candidate/release-v1.2.3',
          types,
          tagPrefix: 'release-',
        })
      ).toMatchObject({ version: '1.2.3' })
    })
  })

  test('creates a release tag pattern', () => {
    const pattern = releaseTagPattern({
      tagPrefix: '',
      version: '1.0.0',
      identifier: 'rc',
    })
    expect('v1.0.0-rc.3').toMatch(pattern)
    expect('1.0.0-rc.3').toMatch(pattern)
    expect('v1.0.0-rc.3-foo').not.toMatch(pattern)
    expect('v1.0.1-rc.1').not.toMatch(pattern)

    const packagePattern = releaseTagPattern({
      tagPrefix: 'package-a/v',
      version: '1.0.0',
      identifier: 'rc',
    })
    expect('package-a/v1.0.0-rc.2').toMatch(packagePattern)
    expect('v1.0.0-rc.9').not.toMatch(packagePattern)
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
    expect(findReleaseBranchPullRequests({ pullRequests, types })).toEqual([
      {
        number: 1,
        prefix: 'release-candidate',
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
        types: { 'release-candidate': 'rc', hotfix: 'hotfix' },
      })
    ).toEqual([
      {
        number: 1,
        prefix: 'release-candidate',
        identifier: 'rc',
        version: '1.0.0',
      },
      {
        number: 2,
        prefix: 'hotfix',
        identifier: 'hotfix',
        version: '1.0.0',
      },
    ])
  })
})
