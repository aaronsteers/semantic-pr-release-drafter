const {
  ReleaseChangeLineItem,
  ReleaseChangeLineItems,
  COMMIT_TYPES,
} = require('../lib/semantic-commits')

const createMockCommits = (messages) =>
  messages.map((message, index) => ({
    id: `sha${index}`,
    message,
    associatedPullRequests: {
      nodes: [
        { merged: true, number: index + 1, url: `https://pr/${index + 1}` },
      ],
    },
  }))

describe('ReleaseChangeLineItem', () => {
  describe('constructor and properties', () => {
    test.each([
      [
        'creates item with all properties',
        {
          type: 'feat',
          scope: 'auth',
          description: 'add login',
          breaking: false,
          raw: 'feat(auth): add login',
          commitSha: 'abc123def456',
          prNumber: 42,
          prUrl: 'https://github.com/org/repo/pull/42',
          author: { login: 'user1' },
        },
        {
          type: 'feat',
          scope: 'auth',
          description: 'add login',
          breaking: false,
          raw: 'feat(auth): add login',
          commitSha: 'abc123def456',
          prNumber: 42,
          prUrl: 'https://github.com/org/repo/pull/42',
          author: { login: 'user1' },
          shortSha: 'abc123d',
          categoryTitle: 'Features',
          bump: 'minor',
        },
      ],
      [
        'handles null/undefined optional properties',
        {
          type: 'fix',
          scope: null,
          description: 'resolve bug',
          breaking: false,
          raw: 'fix: resolve bug',
        },
        {
          type: 'fix',
          scope: null,
          description: 'resolve bug',
          breaking: false,
          raw: 'fix: resolve bug',
          commitSha: null,
          prNumber: null,
          prUrl: null,
          author: null,
          shortSha: null,
          categoryTitle: 'Bug Fixes',
          bump: 'patch',
        },
      ],
      [
        'breaking change overrides bump to major',
        {
          type: 'feat',
          scope: 'api',
          description: 'change endpoint',
          breaking: true,
          raw: 'feat(api)!: change endpoint',
          commitSha: '1234567890abcdef',
        },
        {
          type: 'feat',
          breaking: true,
          shortSha: '1234567',
          bump: 'major',
          categoryTitle: 'Features',
        },
      ],
    ])('%s', (name, input, expected) => {
      const item = new ReleaseChangeLineItem(input)

      for (const [key, value] of Object.entries(expected)) {
        expect(item[key]).toEqual(value)
      }
    })
  })

  describe('category getter', () => {
    test.each(
      Object.keys(COMMIT_TYPES).map((type) => [type, COMMIT_TYPES[type]])
    )('returns correct category for type "%s"', (type, expectedCategory) => {
      const item = new ReleaseChangeLineItem({
        type,
        description: 'test',
        breaking: false,
        raw: `${type}: test`,
      })

      expect(item.category).toEqual(expectedCategory)
      expect(item.categoryTitle).toEqual(expectedCategory.title)
    })
  })

  describe('bump getter', () => {
    test.each([
      ['feat', false, 'minor'],
      ['fix', false, 'patch'],
      ['docs', false, 'patch'],
      ['chore', false, 'patch'],
      ['feat', true, 'major'],
      ['fix', true, 'major'],
      ['chore', true, 'major'],
    ])(
      'type=%s breaking=%s returns bump=%s',
      (type, breaking, expectedBump) => {
        const item = new ReleaseChangeLineItem({
          type,
          description: 'test',
          breaking,
          raw: `${type}: test`,
        })

        expect(item.bump).toEqual(expectedBump)
      }
    )
  })
})

describe('ReleaseChangeLineItems', () => {
  describe('fromCommits', () => {
    test.each([
      [
        'parses single semantic commit',
        ['feat: add feature'],
        { length: 1, types: ['feat'] },
      ],
      [
        'parses multiple commits',
        ['feat: add feature', 'fix: resolve bug', 'chore: update deps'],
        { length: 3, types: ['feat', 'fix', 'chore'] },
      ],
      [
        'handles multi-line commit with multiple semantic entries',
        ['feat: add feature\nfix: resolve bug'],
        { length: 2, types: ['feat', 'fix'] },
      ],
      [
        'ignores non-semantic commits',
        ['feat: add feature', 'random commit message', 'fix: resolve bug'],
        { length: 2, types: ['feat', 'fix'] },
      ],
      [
        'returns empty collection for no semantic commits',
        ['random message', 'another random'],
        { length: 0, types: [] },
      ],
    ])('%s', (name, messages, expected) => {
      const commits = createMockCommits(messages)
      const collection = ReleaseChangeLineItems.fromCommits(commits)

      expect(collection.length).toEqual(expected.length)
      expect(collection.map((item) => item.type)).toEqual(expected.types)
    })
  })

  describe('hasBreakingChanges and hasFeatures', () => {
    test.each([
      [
        'detects breaking changes',
        ['feat!: breaking feature'],
        { hasBreakingChanges: true, hasFeatures: true },
      ],
      [
        'detects features without breaking',
        ['feat: normal feature'],
        { hasBreakingChanges: false, hasFeatures: true },
      ],
      [
        'no features or breaking',
        ['fix: bug fix', 'chore: update'],
        { hasBreakingChanges: false, hasFeatures: false },
      ],
      [
        'breaking fix',
        ['fix!: breaking fix'],
        { hasBreakingChanges: true, hasFeatures: false },
      ],
    ])('%s', (name, messages, expected) => {
      const commits = createMockCommits(messages)
      const collection = ReleaseChangeLineItems.fromCommits(commits)

      expect(collection.hasBreakingChanges).toEqual(expected.hasBreakingChanges)
      expect(collection.hasFeatures).toEqual(expected.hasFeatures)
    })
  })

  describe('resolveVersionBump', () => {
    test.each([
      ['patch for fixes only', ['fix: bug'], {}, 'patch'],
      ['minor for features', ['feat: feature'], {}, 'minor'],
      [
        'minor for breaking pre-1.0 (default)',
        ['feat!: breaking'],
        {},
        'minor',
      ],
      [
        'minor for breaking with noAutoMajor',
        ['feat!: breaking'],
        { currentMajor: 1, noAutoMajor: true },
        'minor',
      ],
      [
        'major for breaking when allowed',
        ['feat!: breaking'],
        {
          currentMajor: 1,
          noAutoMajor: false,
          preOneZeroMinorForBreaking: false,
        },
        'major',
      ],
      [
        'minor for breaking at v0.x with preOneZeroMinorForBreaking',
        ['feat!: breaking'],
        { currentMajor: 0, preOneZeroMinorForBreaking: true },
        'minor',
      ],
      ['patch for empty collection', [], {}, 'patch'],
    ])('%s', (name, messages, config, expectedBump) => {
      const commits = createMockCommits(messages)
      const collection = ReleaseChangeLineItems.fromCommits(commits)

      expect(collection.resolveVersionBump(config)).toEqual(expectedBump)
    })
  })

  describe('categorizeByType', () => {
    test.each([
      [
        'categorizes by type',
        ['feat: f1', 'feat: f2', 'fix: bug', 'chore: update'],
        { feat: 2, fix: 1, chore: 1, docs: 0 },
      ],
      ['handles empty collection', [], { feat: 0, fix: 0, chore: 0 }],
    ])('%s', (name, messages, expectedCounts) => {
      const commits = createMockCommits(messages)
      const collection = ReleaseChangeLineItems.fromCommits(commits)
      const { categories } = collection.categorizeByType()

      for (const [type, count] of Object.entries(expectedCounts)) {
        expect(categories[type].items.length).toEqual(count)
      }
    })
  })

  describe('filter and getByType', () => {
    test.each([
      [
        'getByType returns filtered collection',
        ['feat: f1', 'feat: f2', 'fix: bug'],
        'feat',
        2,
      ],
      [
        'getBreakingChanges returns only breaking',
        ['feat!: breaking', 'feat: normal', 'fix!: breaking fix'],
        'breaking',
        2,
      ],
    ])('%s', (name, messages, filterType, expectedCount) => {
      const commits = createMockCommits(messages)
      const collection = ReleaseChangeLineItems.fromCommits(commits)

      const filtered =
        filterType === 'breaking'
          ? collection.getBreakingChanges()
          : collection.getByType(filterType)

      expect(filtered.length).toEqual(expectedCount)
      expect(filtered).toBeInstanceOf(ReleaseChangeLineItems)
    })
  })

  describe('iteration and conversion', () => {
    test('supports for...of iteration', () => {
      const commits = createMockCommits(['feat: f1', 'fix: bug'])
      const collection = ReleaseChangeLineItems.fromCommits(commits)
      const types = []

      for (const item of collection) {
        types.push(item.type)
      }

      expect(types).toEqual(['feat', 'fix'])
    })

    test('toArray returns plain array', () => {
      const commits = createMockCommits(['feat: f1', 'fix: bug'])
      const collection = ReleaseChangeLineItems.fromCommits(commits)
      const array = collection.toArray()

      expect(Array.isArray(array)).toBe(true)
      expect(array.length).toEqual(2)
    })
  })
})
