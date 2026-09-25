const {
  generateChangeLog,
  generateReleaseInfo,
  findReleases,
} = require('../lib/releases')
const { DEFAULT_CONFIG } = require('../lib/default-config')

const fakeContext = {
  repo: () => ({ owner: 'test', repo: 'repo' }),
  payload: { repository: { full_name: 'test/repo' } },
  log: { info() {}, warn() {} },
}

// Helper to create commits with semantic messages and associated PRs
const createCommit = (message, prNumber, author = null, commitSha = null) => ({
  oid: commitSha || `sha${prNumber}`,
  message,
  associatedPullRequests: {
    nodes: [
      {
        merged: true,
        number: prNumber,
        url: `https://github.com/test/repo/pull/${prNumber}`,
        author: author || { login: 'ghost' },
      },
    ],
  },
})

// Commits with semantic messages for testing
const commits = [
  createCommit('fix: A1', 1),
  createCommit('feat: B2', 2),
  createCommit('fix: Adds missing <example>', 3, { login: 'jetersen' }),
  createCommit('fix: `#code_block`', 4, { login: 'jetersen' }),
  createCommit('fix: Fixes #4', 5, { login: 'Happypig375' }),
  createCommit('fix: 2*2 should equal to 4*1', 6, { login: 'jetersen' }),
  createCommit(
    'chore: Rename __confgs\\confg.yml to __configs\\config.yml',
    7,
    { login: 'ghost' }
  ),
  createCommit(
    'feat: Adds @nullable annotations to the 1*1+2*4 test in `tests.java`',
    8,
    { login: 'Happypig375' }
  ),
  createCommit(
    'chore: Bump golang.org/x/crypto from 0.14.0 to 0.17.0 in /examples',
    9,
    {
      login: 'dependabot',
      __typename: 'Bot',
      url: 'https://github.com/apps/dependabot',
    }
  ),
]

// Legacy pullRequests array (kept for reference but not used in new tests)
const pullRequests = []
const baseConfig = {
  ...DEFAULT_CONFIG,
  template: '$CHANGES',
  references: ['master'],
  categories: [
    { title: 'Features', 'commit-types': ['feat'] },
    { title: 'Bug Fixes', 'commit-types': ['fix'] },
    { title: 'Chores', 'commit-types': ['chore'] },
  ],
}

const releaseInfoConfig = (overrides = {}) => ({
  ...baseConfig,
  ...overrides,
})

const releaseInfoCommit = (message, prNumber) => ({
  ...createCommit(message, prNumber),
  author: { name: 'Test', user: { login: 'ghost' } },
})

describe('releases', () => {
  describe('generateChangeLog', () => {
    it('generates changelog with categories from semantic commits', () => {
      const changelog = generateChangeLog(pullRequests, commits, baseConfig)
      expect(changelog).toMatchInlineSnapshot(`
        "## Features

        * B2 () sha2
        * Adds @nullable annotations to the 1*1+2*4 test in \`tests.java\` () sha8

        ## Bug Fixes

        * A1 () sha1
        * Adds missing <example> () sha3
        * \`#code_block\` () sha4
        * Fixes #4 () sha5
        * 2*2 should equal to 4*1 () sha6

        ## Chores

        * Rename __confgs\\\\confg.yml to __configs\\\\config.yml () sha7
        * Bump golang.org/x/crypto from 0.14.0 to 0.17.0 in /examples () sha9"
      `)
    })

    it('escapes titles with @s correctly', () => {
      const config = {
        ...baseConfig,
        'change-title-escapes': '@',
      }
      const changelog = generateChangeLog(pullRequests, commits, config)
      expect(changelog).toMatchInlineSnapshot(`
        "## Features

        * B2 () sha2
        * Adds @<!---->nullable annotations to the 1*1+2*4 test in \`tests.java\` () sha8

        ## Bug Fixes

        * A1 () sha1
        * Adds missing <example> () sha3
        * \`#code_block\` () sha4
        * Fixes #4 () sha5
        * 2*2 should equal to 4*1 () sha6

        ## Chores

        * Rename __confgs\\\\confg.yml to __configs\\\\config.yml () sha7
        * Bump golang.org/x/crypto from 0.14.0 to 0.17.0 in /examples () sha9"
      `)
    })

    it('escapes titles with @s and #s correctly', () => {
      const config = {
        ...baseConfig,
        'change-title-escapes': '@#',
      }
      const changelog = generateChangeLog(pullRequests, commits, config)
      // Note: Content inside backticks is preserved (not escaped)
      expect(changelog).toMatchInlineSnapshot(`
        "## Features

        * B2 () sha2
        * Adds @<!---->nullable annotations to the 1*1+2*4 test in \`tests.java\` () sha8

        ## Bug Fixes

        * A1 () sha1
        * Adds missing <example> () sha3
        * \`#code_block\` () sha4
        * Fixes #<!---->4 () sha5
        * 2*2 should equal to 4*1 () sha6

        ## Chores

        * Rename __confgs\\\\confg.yml to __configs\\\\config.yml () sha7
        * Bump golang.org/x/crypto from 0.14.0 to 0.17.0 in /examples () sha9"
      `)
    })

    it('returns no-changes-template for empty commits', () => {
      const changelog = generateChangeLog(pullRequests, [], baseConfig)
      expect(changelog).toEqual('* No changes')
    })
  })

  describe('generateReleaseInfo', () => {
    const baseArgs = {
      context: fakeContext,
      commits: [releaseInfoCommit('feat: newer change', 11)],
      mergedPullRequests: [],
      lastRelease: { tag_name: 'v1.0.0-rc.3' },
      isPreRelease: true,
      shouldDraft: true,
      targetCommitish: 'refs/heads/release-candidate/v1',
    }

    it('mirrors $CHANGES/$PREVIOUS_TAG when no gaBaseline is given', () => {
      const { body } = generateReleaseInfo({
        ...baseArgs,
        config: releaseInfoConfig({
          template:
            'GA: $PREVIOUS_GA_TAG\n$CHANGES_SINCE_GA\nRC: $PREVIOUS_TAG\n$CHANGES\n',
        }),
      })
      expect(body).toContain('GA: v1.0.0-rc.3')
      expect(body).toContain('RC: v1.0.0-rc.3')
      expect(body).toContain('Newer change')
    })

    it('renders $CHANGES_SINCE_GA/$PREVIOUS_GA_TAG from gaBaseline when given', () => {
      const { body } = generateReleaseInfo({
        ...baseArgs,
        config: releaseInfoConfig({
          template:
            'GA: $PREVIOUS_GA_TAG\n$CHANGES_SINCE_GA\nRC: $PREVIOUS_TAG\n$CHANGES\n',
        }),
        gaBaseline: {
          lastRelease: { tag_name: 'v0.71.0' },
          commits: [
            releaseInfoCommit('feat: newer change', 11),
            releaseInfoCommit('fix: older change', 10),
          ],
          mergedPullRequests: [],
        },
      })
      expect(body).toContain('GA: v0.71.0')
      expect(body).toContain('RC: v1.0.0-rc.3')
      expect(body).toContain('Older change')
      expect(body).toContain('Newer change')
    })

    it('uses release-track-template only on a release track', () => {
      const config = releaseInfoConfig({
        template: 'BASE $CHANGES',
        'release-track-template': 'TRACK $CHANGES',
      })
      const onTrack = generateReleaseInfo({
        ...baseArgs,
        config,
        isReleaseTrack: true,
      })
      expect(onTrack.body).toContain('TRACK')
      expect(onTrack.body).not.toContain('BASE')
      const offTrack = generateReleaseInfo({
        ...baseArgs,
        config,
        isReleaseTrack: false,
      })
      expect(offTrack.body).toContain('BASE')
      expect(offTrack.body).not.toContain('TRACK')
    })
  })

  describe('findReleases', () => {
    it('should retrieve last release respecting semver, stripped prefix', async () => {
      const paginate = jest.fn().mockResolvedValue([
        {
          tag_name: 'test-1.0.1',
          target_commitish: 'master',
          created_at: '2021-06-29T05:45:15Z',
        },
        {
          tag_name: 'test-1.0.0',
          target_commitish: 'master',
          created_at: '2022-06-29T05:45:15Z',
        },
      ])

      const context = {
        log: {
          info: jest.fn(),
        },
        repo: jest.fn(),
        payload: {
          repository: 'test',
        },
        octokit: {
          paginate,
          repos: { listReleases: { endpoint: { merge: jest.fn() } } },
        },
      }
      const targetCommitish = 'refs/heads/master'
      const filterByCommitish = ''
      const tagPrefix = 'test-'

      const { lastRelease } = await findReleases({
        context,
        targetCommitish,
        filterByCommitish,
        tagPrefix,
      })
      expect(lastRelease.tag_name).toEqual('test-1.0.1')
    })

    const paginateMock = jest.fn()
    const context = {
      payload: { repository: { full_name: 'test' } },
      octokit: {
        paginate: paginateMock,
        repos: { listReleases: { endpoint: { merge: jest.fn() } } },
      },
      repo: jest.fn(),
      log: { info: jest.fn(), warn: jest.fn() },
    }

    it('should return last release without draft and prerelease', async () => {
      paginateMock.mockResolvedValueOnce([
        { tag_name: 'v1.0.0', draft: true, prerelease: false },
        { tag_name: 'v1.0.1', draft: false, prerelease: false },
        { tag_name: 'v1.0.2-rc.1', draft: false, prerelease: true },
      ])

      const { lastRelease } = await findReleases({
        context,
        targetCommitish: 'refs/heads/master',
        tagPrefix: '',
      })

      expect(lastRelease).toEqual({
        tag_name: 'v1.0.1',
        draft: false,
        prerelease: false,
      })
    })

    it('should return last draft release', async () => {
      paginateMock.mockResolvedValueOnce([
        { tag_name: 'v1.0.0', draft: true, prerelease: false },
        { tag_name: 'v1.0.1', draft: false, prerelease: false },
        { tag_name: 'v1.0.2-rc.1', draft: false, prerelease: true },
      ])

      const { draftRelease } = await findReleases({
        context,
        targetCommitish: 'refs/heads/master',
        includePreReleases: false,
        tagPrefix: '',
      })

      expect(draftRelease).toEqual({
        tag_name: 'v1.0.0',
        draft: true,
        prerelease: false,
      })
    })

    it('should return last prerelease as last release when includePreReleases is true', async () => {
      paginateMock.mockResolvedValueOnce([
        { tag_name: 'v1.0.0', draft: true, prerelease: false },
        { tag_name: 'v1.0.1', draft: false, prerelease: false },
        { tag_name: 'v1.0.2-rc.1', draft: true, prerelease: true },
      ])

      const { draftRelease, lastRelease } = await findReleases({
        context,
        targetCommitish: 'refs/heads/master',
        tagPrefix: '',
        includePreReleases: true,
      })

      expect(draftRelease).toEqual({
        tag_name: 'v1.0.2-rc.1',
        draft: true,
        prerelease: true,
      })

      expect(lastRelease).toEqual({
        tag_name: 'v1.0.1',
        draft: false,
        prerelease: false,
      })
    })
  })
})
