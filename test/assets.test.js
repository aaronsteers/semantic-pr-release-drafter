const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { resolveFiles, manageReleaseAssets } = require('../lib/assets')

const mockCore = {
  debug: jest.fn(),
  info: jest.fn(),
}

jest.mock('@actions/core', () => mockCore)

const createMockContext = (existingAssets = []) => {
  const mockOctokit = {
    paginate: jest.fn().mockResolvedValue(existingAssets),
    repos: {
      listReleaseAssets: jest.fn(),
      deleteReleaseAsset: jest.fn().mockResolvedValue({}),
      uploadReleaseAsset: jest.fn().mockResolvedValue({
        data: { id: 123, name: 'uploaded-file.txt' },
      }),
    },
  }

  return {
    octokit: mockOctokit,
    repo: (params) => ({ owner: 'test-owner', repo: 'test-repo', ...params }),
    log: { info: jest.fn(), debug: jest.fn() },
    payload: {
      repository: {
        full_name: 'test-owner/test-repo',
      },
    },
  }
}

describe('resolveFiles', () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  const createTestFiles = (files) => {
    for (const file of files) {
      const filePath = path.join(tempDir, file)
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(filePath, `content of ${file}`)
    }
  }

  describe('parameterized glob pattern tests', () => {
    const testCases = [
      {
        name: 'single file path',
        files: ['file.txt'],
        pattern: 'file.txt',
        expectedCount: 1,
        expectedFiles: ['file.txt'],
      },
      {
        name: 'wildcard pattern',
        files: ['file1.txt', 'file2.txt', 'other.md'],
        pattern: '*.txt',
        expectedCount: 2,
        expectedFiles: ['file1.txt', 'file2.txt'],
      },
      {
        name: 'brace expansion',
        files: ['app.whl', 'app.tar.gz', 'app.zip'],
        pattern: '*.{whl,tar.gz}',
        expectedCount: 2,
        expectedFiles: ['app.tar.gz', 'app.whl'],
      },
      {
        name: 'nested directory pattern',
        files: ['dist/file1.whl', 'dist/file2.whl', 'src/other.js'],
        pattern: 'dist/*.whl',
        expectedCount: 2,
        expectedFiles: ['dist/file1.whl', 'dist/file2.whl'],
      },
      {
        name: 'multiple patterns (newline-separated)',
        files: ['dist/app.whl', 'dist/app.tar.gz', 'bin/cli'],
        pattern: 'dist/*.whl\ndist/*.tar.gz',
        expectedCount: 2,
        expectedFiles: ['dist/app.tar.gz', 'dist/app.whl'],
      },
      {
        name: 'deduplication across patterns',
        files: ['dist/app.whl', 'dist/app.tar.gz'],
        pattern: 'dist/*\ndist/*.whl',
        expectedCount: 2,
        expectedFiles: ['dist/app.tar.gz', 'dist/app.whl'],
      },
      {
        name: 'pattern with whitespace trimming',
        files: ['file.txt'],
        pattern: '  file.txt  \n  ',
        expectedCount: 1,
        expectedFiles: ['file.txt'],
      },
    ]

    test.each(testCases)(
      '$name',
      async ({ files, pattern, expectedCount, expectedFiles }) => {
        createTestFiles(files)

        const result = await resolveFiles(pattern, tempDir)

        expect(result).toHaveLength(expectedCount)

        const basenames = result.map((f) => path.relative(tempDir, f))
        expect(basenames.sort()).toEqual(expectedFiles.sort())
      }
    )
  })

  describe('edge cases', () => {
    test('returns empty array for empty input', async () => {
      const result = await resolveFiles('', tempDir)
      expect(result).toEqual([])
    })

    test('returns empty array for null input', async () => {
      const result = await resolveFiles(null, tempDir)
      expect(result).toEqual([])
    })

    test('returns empty array for undefined input', async () => {
      const result = await resolveFiles(undefined, tempDir)
      expect(result).toEqual([])
    })

    test('returns empty array for whitespace-only input', async () => {
      const result = await resolveFiles('   \n   ', tempDir)
      expect(result).toEqual([])
    })

    test('returns empty array when no files match', async () => {
      createTestFiles(['file.txt'])
      const result = await resolveFiles('*.whl', tempDir)
      expect(result).toEqual([])
    })

    test('results are lexically sorted', async () => {
      createTestFiles(['z.txt', 'a.txt', 'm.txt'])
      const result = await resolveFiles('*.txt', tempDir)
      const basenames = result.map((f) => path.basename(f))
      expect(basenames).toEqual(['a.txt', 'm.txt', 'z.txt'])
    })

    test('handles absolute paths in pattern', async () => {
      createTestFiles(['file.txt'])
      const absolutePattern = path.join(tempDir, 'file.txt')
      const result = await resolveFiles(absolutePattern, tempDir)
      expect(result).toHaveLength(1)
      expect(path.basename(result[0])).toBe('file.txt')
    })
  })
})

describe('manageReleaseAssets integration', () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-integration-'))
    jest.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  const createTestFiles = (files) => {
    for (const file of files) {
      const filePath = path.join(tempDir, file)
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(filePath, `content of ${file}`)
    }
  }

  test('uploads files matching glob pattern', async () => {
    createTestFiles(['dist/app-1.0.0.whl', 'dist/app-1.0.0.tar.gz'])

    const mockContext = createMockContext([])
    const originalEnv = process.env.GITHUB_WORKSPACE
    process.env.GITHUB_WORKSPACE = tempDir

    await manageReleaseAssets({
      context: mockContext,
      releaseId: 12_345,
      attachFilesInput: 'dist/*.whl\ndist/*.tar.gz',
    })

    process.env.GITHUB_WORKSPACE = originalEnv

    expect(mockContext.octokit.repos.uploadReleaseAsset).toHaveBeenCalledTimes(
      2
    )
  })

  test('deletes existing assets before uploading new ones', async () => {
    createTestFiles(['dist/new-file.whl'])

    const existingAssets = [
      { id: 1, name: 'old-file-1.whl' },
      { id: 2, name: 'old-file-2.tar.gz' },
    ]

    const mockContext = createMockContext(existingAssets)
    const originalEnv = process.env.GITHUB_WORKSPACE
    process.env.GITHUB_WORKSPACE = tempDir

    await manageReleaseAssets({
      context: mockContext,
      releaseId: 12_345,
      attachFilesInput: 'dist/*.whl',
    })

    process.env.GITHUB_WORKSPACE = originalEnv

    expect(mockContext.octokit.repos.deleteReleaseAsset).toHaveBeenCalledTimes(
      2
    )
    expect(mockContext.octokit.repos.uploadReleaseAsset).toHaveBeenCalledTimes(
      1
    )
  })

  test('throws error when no files match pattern', async () => {
    createTestFiles(['dist/file.txt'])

    const mockContext = createMockContext([])
    const originalEnv = process.env.GITHUB_WORKSPACE
    process.env.GITHUB_WORKSPACE = tempDir

    await expect(
      manageReleaseAssets({
        context: mockContext,
        releaseId: 12_345,
        attachFilesInput: 'dist/*.whl',
      })
    ).rejects.toThrow('attach-files was specified but no files matched')

    process.env.GITHUB_WORKSPACE = originalEnv
  })

  test('logs files that would be uploaded', async () => {
    createTestFiles(['dist/app.whl', 'dist/app.tar.gz'])

    const mockContext = createMockContext([])
    const originalEnv = process.env.GITHUB_WORKSPACE
    process.env.GITHUB_WORKSPACE = tempDir

    await manageReleaseAssets({
      context: mockContext,
      releaseId: 12_345,
      attachFilesInput: 'dist/*',
    })

    process.env.GITHUB_WORKSPACE = originalEnv

    expect(mockContext.log.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully attached 2 assets')
    )
  })
})
