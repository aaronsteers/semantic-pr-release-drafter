const fs = require('node:fs')
const path = require('node:path')
const { glob } = require('glob')
const core = require('@actions/core')
const { log } = require('./log')

const resolveFiles = async (attachFilesInput, workspacePath) => {
  if (!attachFilesInput || attachFilesInput.trim() === '') {
    return []
  }

  const patterns = attachFilesInput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (patterns.length === 0) {
    return []
  }

  const allFiles = new Set()

  for (const pattern of patterns) {
    const absolutePattern = path.isAbsolute(pattern)
      ? pattern
      : path.join(workspacePath, pattern)

    core.debug(`Resolving glob pattern: ${absolutePattern}`)

    const matches = await glob(absolutePattern, {
      nodir: true,
      absolute: true,
    })

    for (const match of matches) {
      allFiles.add(match)
    }
  }

  const sortedFiles = [...allFiles].sort()

  core.info(`Resolved ${sortedFiles.length} files to attach:`)
  for (const file of sortedFiles) {
    core.info(`  - ${file}`)
  }

  return sortedFiles
}

const listReleaseAssets = async ({ context, releaseId }) => {
  const assets = await context.octokit.paginate(
    context.octokit.repos.listReleaseAssets,
    context.repo({
      release_id: releaseId,
      per_page: 100,
    })
  )

  log({
    context,
    message: `Found ${assets.length} existing assets on release`,
  })

  return assets
}

const deleteReleaseAsset = async ({ context, assetId, assetName }) => {
  log({
    context,
    message: `Deleting asset: ${assetName} (ID: ${assetId})`,
  })

  await context.octokit.repos.deleteReleaseAsset(
    context.repo({
      asset_id: assetId,
    })
  )
}

const deleteAllReleaseAssets = async ({ context, releaseId }) => {
  const assets = await listReleaseAssets({ context, releaseId })

  if (assets.length === 0) {
    log({ context, message: 'No existing assets to delete' })
    return
  }

  log({
    context,
    message: `Deleting ${assets.length} existing assets for idempotency`,
  })

  for (const asset of assets) {
    await deleteReleaseAsset({
      context,
      assetId: asset.id,
      assetName: asset.name,
    })
  }

  log({ context, message: 'All existing assets deleted successfully' })
}

const uploadReleaseAsset = async ({ context, releaseId, filePath }) => {
  const fileName = path.basename(filePath)
  const fileContent = await fs.promises.readFile(filePath)
  const fileStats = await fs.promises.stat(filePath)

  log({
    context,
    message: `Uploading asset: ${fileName} (${fileStats.size} bytes)`,
  })

  const response = await context.octokit.repos.uploadReleaseAsset(
    context.repo({
      release_id: releaseId,
      name: fileName,
      data: fileContent,
    })
  )

  log({
    context,
    message: `Successfully uploaded: ${fileName}`,
  })

  return response.data
}

const manageReleaseAssets = async ({
  context,
  releaseId,
  attachFilesInput,
}) => {
  const workspacePath = process.env.GITHUB_WORKSPACE || process.cwd()

  log({
    context,
    message: `Managing release assets (workspace: ${workspacePath})`,
  })

  const filesToAttach = await resolveFiles(attachFilesInput, workspacePath)

  if (filesToAttach.length === 0) {
    throw new Error(
      'attach-files was specified but no files matched the pattern(s). ' +
        'Please check your glob patterns and ensure the files exist. ' +
        `Patterns: ${attachFilesInput
          .split('\n')
          .filter((p) => p.trim())
          .join(', ')}`
    )
  }

  await deleteAllReleaseAssets({ context, releaseId })

  const uploadedAssets = []
  for (const filePath of filesToAttach) {
    const asset = await uploadReleaseAsset({ context, releaseId, filePath })
    uploadedAssets.push(asset)
  }

  log({
    context,
    message: `Successfully attached ${uploadedAssets.length} assets to release`,
  })

  return uploadedAssets
}

exports.resolveFiles = resolveFiles
exports.listReleaseAssets = listReleaseAssets
exports.deleteAllReleaseAssets = deleteAllReleaseAssets
exports.uploadReleaseAsset = uploadReleaseAsset
exports.manageReleaseAssets = manageReleaseAssets
