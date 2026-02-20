# How to Release

> [!NOTE]
> If your repo uses `semantic-pr-release-drafter`, we recommend linking to this guide from your `CONTRIBUTING.md` rather than duplicating release instructions. For example, add a `## Releasing` section with a link to this page.

This guide covers the common release workflow for repositories using [`semantic-pr-release-drafter`](https://github.com/aaronsteers/semantic-pr-release-drafter).

## Publishing a Release

1. Navigate to your repository's **Releases** page (e.g., `https://github.com/<owner>/<repo>/releases`).
2. You should see a **Draft** release at the top with auto-generated release notes.
3. Review the draft:
   - Verify the version number is correct.
   - Review the changelog entries.
   - Optionally edit the release notes if needed.
4. Click **"Publish release"** to finalize.

Once published, any downstream workflows (e.g., PyPI publish, npm publish, Docker build) will be triggered automatically via the `on: release` event.

<details>
<summary><b>🔍 How It Works</b></summary>

## How It Works

1. **Semantic PR titles** drive versioning. Every PR merged to `main` should have a title following [Conventional Commits](https://www.conventionalcommits.org/) format (e.g., `feat: add new feature`, `fix: resolve bug`, `feat!: remove deprecated API`).
2. **Draft releases are updated automatically.** On each push to `main`, the release drafter workflow creates or updates a draft GitHub Release with auto-generated release notes and a resolved version number.
3. **You publish when ready.** A maintainer reviews the draft and clicks "Publish release" to finalize it.

## Version Resolution

Versions are resolved automatically based on the semantic commit types of merged PRs:

| Commit type                                                                | Version bump                       |
| -------------------------------------------------------------------------- | ---------------------------------- |
| Breaking change (`feat!:`, `fix!:`, etc.)                                  | Minor\* (e.g., `1.2.3` -> `1.3.0`) |
| `feat`                                                                     | Minor (e.g., `1.2.3` -> `1.3.0`)   |
| `fix`, `docs`, `chore`, `ci`, `refactor`, `test`, `perf`, `build`, `style` | Patch (e.g., `1.2.3` -> `1.2.4`)   |

\*By default, breaking changes trigger minor bumps (marketing-friendly semver). To enable automatic major bumps for breaking changes, set `allow-major-bumps: true` in your workflow configuration.

### Pre-1.0 Projects

For projects that haven't reached `v1.0.0` yet, semver safety rules apply automatically:

- Major bumps become minor bumps (e.g., `0.2.3` -> `0.3.0` instead of `1.0.0`)
- Minor bumps become patch bumps (e.g., `0.2.3` -> `0.2.4` instead of `0.3.0`)

</details>

<details>
<summary><b>⚙️ Advanced Usage</b></summary>

## Version Preservation

If you manually set the draft release version (e.g., to `v2.0.0`), the action will never bump it backwards. Prerelease identifiers (like `-beta`, `-rc.1`) are also preserved exactly as set.

This is useful when you want to:

- Force a major version bump for marketing or strategic reasons.
- Create release candidates (e.g., `v2.0.0-rc.1`).

## Pre-releases

To publish a pre-release:

1. Edit the draft release and set the `Title` and `Tag` to your desired prerelease version (e.g., `v1.0.0-rc.1`).
2. Save the draft, then re-run the release drafter workflow from the Actions tab to regenerate assets with the correct version.
3. Publish the release.

> **Note:** Whether to check GitHub's "Set as a pre-release" checkbox depends on your project. Some registries (e.g., Terraform Registry) will not sync pre-releases, so check your project's specific guidance.

## Recommended Repository Configuration

For the best experience with this action, configure your repository as follows:

1. **Enable squash merging** as the default (or only) merge method.
2. **Set the default commit message** to "Pull request title" so the squashed commit inherits the semantic PR title.
3. **Add PR title validation** using [`amannn/action-semantic-pull-request`](https://github.com/amannn/action-semantic-pull-request) to enforce conventional commit format on all PRs.

For full configuration details, see the [semantic-pr-release-drafter README](https://github.com/aaronsteers/semantic-pr-release-drafter#readme).

</details>
