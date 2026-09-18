const {
  parseReleaseBranch,
  releaseTagPattern,
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

    test.each([
      'other/v1.0.0',
      'release-candidate/v1.0.0-rc.1',
      'release-candidate/foo1',
    ])('rejects %s', (ref) => {
      expect(parseReleaseBranch({ ref, types })).toBeNull()
    })

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
  })

  test('filters merged pull requests and deduplicates versions', () => {
    const pullRequests = [
      { number: 1, merged: true, headRefName: 'release-candidate/v1' },
      { number: 2, merged: true, headRefName: 'release-candidate/v1.0.0' },
      { number: 3, merged: false, headRefName: 'release-candidate/v2' },
      { number: 4, merged: true, headRefName: 'other/v2' },
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
})
