# <p align="center">🔷 Semantic PR Release Drafter 🔷</p>

✍️ _Draft your next release notes based on semantic PR commit messages. No labels required. _

## About This Fork

This is a fork of the much loved [release-drafter/release-drafter](https://github.com/release-drafter/release-drafter) from [TimonVS](https://github.com/TimonVS) and [jetersen](https://github.com/jetersen). This fork replaces label-based categorization and version resolution with **conventional commits** and **semantic PR titles**.

This fork adds a number of features to streamline your workflow, such as:

- **Zero-config support** - Works out-of-the-box with lovable defaults. No config file or inline inputs required.
- **Inline config inputs** - Configure the action directly in your workflow file without needing a separate config file (see [Inline Configuration](#inline-configuration-recommended)).
- **Attach File Assets** - Idempotent file asset attachment - allowing you to define the draft text as well as the release assets all in one step.

- zero-config lovable defaults
- ability to attach file assets during draft updates
- built-in support for immutable releases

### Removed Features

Labels are _**no longer used**_ for categorization, with all label-related features having been dropped.

This fork DROPS all support for:

- **Auto-labeler** - Auto-labeling is no longer supported.
- **Label-based version resolver** - Version is determined by conventional-commit `type` properties, not labels.
- **Label-based categorization** - Categories are determined by conventional-commit `scope` and `type` properties, not labels.

### Recommended Repo Configuration

To get the most out of this action, we recommend configuring your repository as follows:

**1. Validate PR titles with [amannn/action-semantic-pull-request](https://github.com/amannn/action-semantic-pull-request)**

Add a workflow to ensure all PR titles follow the Conventional Commits format:

```yaml
name: Validate PR Title

on:
  pull_request:
    types: [opened, edited, synchronize]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**2. Configure GitHub repository settings**

In your repository settings (Settings > General > Pull Requests):

- Enable **"Allow squash merging"** and set it as the default merge method
- Set **"Default commit message"** to **"Pull request title"** so the squashed commit inherits the semantic PR title
- **Disable other merge methods** (merge commits and rebase merging) to enforce squash merging

This ensures that when PRs are merged, the resulting commit on main has a properly formatted semantic commit message that this action can parse. Without squash merging, the action cannot reliably determine version bumps from commit history.

### Example Usages

Looking for real-world examples? Here are two ways to find how others have integrated this action into their workflows:

- [Dependent repositories](https://github.com/aaronsteers/semantic-pr-release-drafter/network/dependents) - Browse repos that use this action
- [Code search](https://github.com/search?q=uses%3A+aaronsteers%2Fsemantic-pr-release-drafter%40&type=code) - Find workflow file examples

---

## Usage

You can use this action in a [GitHub Actions Workflow](https://help.github.com/en/actions/about-github-actions) by configuring a YAML-based workflow file, e.g. `.github/workflows/release-drafter.yml`, with the following:

```yaml
name: Release Drafter

on:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  update_release_draft:
    permissions:
      contents: write
    runs-on: ubuntu-latest
    steps:
      - uses: aaronsteers/semantic-pr-release-drafter@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Configuration

Release Drafter can be configured in two ways:

1. **Inline config inputs** - Pass configuration directly as action inputs in your workflow file
2. **Config file** - Create a `.github/release-drafter.yml` file in your repository's default branch

You can use either method, or combine both (inline inputs override file config).

### Inline Configuration (Recommended)

The simplest way to configure Release Drafter is to pass configuration directly in your workflow file:

```yaml
name: Release Drafter

on:
  push:
    branches:
      - main

permissions:
  contents: write

jobs:
  update_release_draft:
    runs-on: ubuntu-latest
    steps:
      - uses: aaronsteers/semantic-pr-release-drafter@main
        with:
          name-template: 'v$RESOLVED_VERSION'
          tag-template: 'v$RESOLVED_VERSION'
          change-template: '* $TITLE ($URL) $SHA'
          template: |
            $CHANGES

            ---

            **Full Changelog**: https://github.com/$OWNER/$REPOSITORY/compare/$PREVIOUS_TAG...v$RESOLVED_VERSION
          categories: |
            - title: 'Breaking Changes'
              commit-types:
                - 'breaking'
            - title: 'Features'
              commit-types:
                - 'feat'
            - title: 'Bug Fixes'
              commit-types:
                - 'fix'
            - title: 'Documentation'
              collapse-after: 2
              commit-types:
                - 'docs'
            - title: 'Under the Hood'
              collapse-after: 2
              commit-types:
                - 'chore'
                - 'ci'
                - 'build'
                - 'refactor'
                - 'test'
                - 'perf'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### File-Based Configuration

Alternatively, you can create a `.github/release-drafter.yml` configuration file. The configuration file **must** reside in your default branch.

For example, take the following `.github/release-drafter.yml` file in a repository:

```yml
template: |
  ## What’s Changed

  $CHANGES
```

As pull requests are merged, a draft release is kept up-to-date listing the changes, ready to publish when you’re ready:

<img src="design/screenshot.png" alt="Screenshot of generated draft release" width="586" />

The following is a more complete configuration example:

```yml
name-template: 'v$RESOLVED_VERSION'
tag-template: 'v$RESOLVED_VERSION'
change-template: '- $TITLE @$AUTHOR (#$NUMBER)'
change-title-escapes: '\<*_&'
template: |
  ## Changes

  $CHANGES
```

Note: Version resolution and categorization are handled automatically based on semantic commit types. No labels or version-resolver configuration needed.

## Configuration Options

The following options can be set in your `.github/release-drafter.yml` file or passed as inline action inputs (see [Inline Configuration](#inline-configuration-recommended)):

| Key                        | Required | Description                                                                                                                                                                        |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `template`                 | Required | The template for the body of the draft release. Use [template variables](#template-variables) to insert values.                                                                    |
| `header`                   | Optional | Will be prepended to `template`. Use [template variables](#template-variables) to insert values.                                                                                   |
| `footer`                   | Optional | Will be appended to `template`. Use [template variables](#template-variables) to insert values.                                                                                    |
| `category-template`        | Optional | The template to use for each category. Use [category template variables](#category-template-variables) to insert values. Default: `"## $TITLE"`.                                   |
| `name-template`            | Optional | The template for the name of the draft release. For example: `"v$NEXT_PATCH_VERSION"`.                                                                                             |
| `tag-template`             | Optional | The template for the tag of the draft release. For example: `"v$NEXT_PATCH_VERSION"`.                                                                                              |
| `tag-prefix`               | Optional | A known prefix used to filter release tags. For matching tags, this prefix is stripped before attempting to parse the version. Default: `""`                                       |
| `version-template`         | Optional | The template to use when calculating the next version number for the release. Useful for projects that don't use semantic versioning. Default: `"$MAJOR.$MINOR.$PATCH"`            |
| `change-template`          | Optional | The template to use for each merged pull request. Use [change template variables](#change-template-variables) to insert values. Default: `"* $TITLE (#$NUMBER) @$AUTHOR"`.         |
| `change-title-escapes`     | Optional | Characters to escape in `$TITLE` when inserting into `change-template` so that they are not interpreted as Markdown format characters. Default: `""`                               |
| `no-changes-template`      | Optional | The template to use for when there’s no changes. Default: `"* No changes"`.                                                                                                        |
| `references`               | Optional | The references to listen for configuration updates to `.github/release-drafter.yml`. Refer to [References](#references) to learn more about this                                   |
| `categories`               | Optional | Categorize pull requests using commit types. Refer to [Categorize Changes](#categorize-changes) to learn more about this option.                                                   |
| `exclude-contributors`     | Optional | Exclude specific usernames from the generated `$CONTRIBUTORS` variable. Refer to [Exclude Contributors](#exclude-contributors) to learn more about this option.                    |
| `include-pre-releases`     | Optional | Include pre releases as "full" releases when drafting release notes. Default: `false`.                                                                                             |
| `no-contributors-template` | Optional | The template to use for `$CONTRIBUTORS` when there's no contributors to list. Default: `"No contributors"`.                                                                        |
| `replacers`                | Optional | Search and replace content in the generated changelog body. Refer to [Replacers](#replacers) to learn more about this option.                                                      |
| `sort-by`                  | Optional | Sort changelog by merged_at or title. Can be one of: `merged_at`, `title`. Default: `merged_at`.                                                                                   |
| `sort-direction`           | Optional | Sort changelog in ascending or descending order. Can be one of: `ascending`, `descending`. Default: `descending`.                                                                  |
| `prerelease`               | Optional | Mark the draft release as pre-release. Default `false`.                                                                                                                            |
| `latest`                   | Optional | Mark the release as latest. Only works for published releases. Can be one of: `true`, `false`, `legacy`. Default `true`.                                                           |
| `version-resolver`         | Optional | Adjust the `$RESOLVED_VERSION` variable using labels. Refer to [Version Resolver](#version-resolver) to learn more about this                                                      |
| `commitish`                | Optional | The release target, i.e. branch or commit it should point to. Default: the ref that release-drafter runs for, e.g. `refs/heads/master` if configured to run on pushes to `master`. |
| `filter-by-commitish`      | Optional | Filter previous releases to consider only those with the target matching `commitish`. Default: `false`.                                                                            |
| `include-paths`            | Optional | Restrict pull requests included in the release notes to only the pull requests that modified any of the paths in this array. Supports files and directories. Default: `[]`         |

Release Drafter also supports [Probot Config](https://github.com/probot/probot-config), if you want to store your configuration files in a central repository. This allows you to share configurations between projects, and create a organization-wide configuration file by creating a repository named `.github` with the file `.github/release-drafter.yml`.

## Template Variables

You can use any of the following variables in your `template`, `header` and `footer`:

| Variable        | Description                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `$CHANGES`      | The markdown list of pull requests that have been merged.                                                             |
| `$CONTRIBUTORS` | A comma separated list of contributors to this release (pull request authors, commit authors, and commit committers). |
| `$PREVIOUS_TAG` | The previous releases’s tag.                                                                                          |
| `$REPOSITORY`   | Current Repository                                                                                                    |
| `$OWNER`        | Current Repository Owner                                                                                              |

## Category Template Variables

You can use any of the following variables in `category-template`:

| Variable | Description                          |
| -------- | ------------------------------------ |
| `$TITLE` | The category title, e.g. `Features`. |

## Next Version Variables

You can use any of the following variables in your `template`, `header`, `footer`, `name-template` and `tag-template`:

| Variable              | Description                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$NEXT_PATCH_VERSION` | The next patch version number. For example, if the last tag or release was `v1.2.3`, the value would be `v1.2.4`. This is the most commonly used value. |
| `$NEXT_MINOR_VERSION` | The next minor version number. For example, if the last tag or release was `v1.2.3`, the value would be `v1.3.0`.                                       |
| `$NEXT_MAJOR_VERSION` | The next major version number. For example, if the last tag or release was `v1.2.3`, the value would be `v2.0.0`.                                       |
| `$RESOLVED_VERSION`   | The next resolved version number, based on GitHub labels. Refer to [Version Resolver](#version-resolver) to learn more about this.                      |

## Version Template Variables

You can use any of the following variables in `version-template` to format the `$NEXT_{PATCH,MINOR,MAJOR}_VERSION` variables:

| Variable    | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `$PATCH`    | The patch version number.                                    |
| `$MINOR`    | The minor version number.                                    |
| `$MAJOR`    | The major version number.                                    |
| `$COMPLETE` | The complete version string (including any prerelease info). |

## Version Resolver

Version bumps are automatically determined based on semantic commit types:

- **Breaking changes** (`feat!:`, `fix!:`, or commits with `BREAKING CHANGE:` in the body) trigger a major version bump (or minor if pre-1.0)
- **Features** (`feat:`) trigger a minor version bump
- **Fixes** (`fix:`) trigger a patch version bump
- **Other types** (`docs:`, `chore:`, `refactor:`, etc.) don't affect version

The `$RESOLVED_VERSION` variable reflects the calculated next version based on these rules.

## Change Template Variables

You can use any of the following variables in `change-template`:

| Variable         | Description                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$NUMBER`        | The number of the pull request, e.g. `42`.                                                                                                                                                                                                                                                                                                                                             |
| `$TITLE`         | The title of the pull request, e.g. `Add alien technology`. Any characters excluding @ and # matching `change-title-escapes` will be prepended with a backslash so that they will appear verbatim instead of being interpreted as markdown format characters. @s and #s if present in `change-title-escapes` will be appended with an HTML comment so that they don't become mentions. |
| `$AUTHOR`        | The pull request author's username, e.g. `gracehopper`.                                                                                                                                                                                                                                                                                                                                |
| `$SHA`           | The short commit SHA, e.g. `abc1234`.                                                                                                                                                                                                                                                                                                                                                  |
| `$URL`           | The URL of the pull request, e.g. `https://github.com/octocat/repo/pull/42`. Calculated from `$NUMBER`.                                                                                                                                                                                                                                                                                |
| `$BASE_REF_NAME` | The base name of of the base Ref associated with the pull request e.g. `main`.                                                                                                                                                                                                                                                                                                         |
| `$HEAD_REF_NAME` | The head name of the head Ref associated with the pull request e.g. `my-bug-fix`.                                                                                                                                                                                                                                                                                                      |

## References

**Note**: This is only revelant for GitHub app users as `references` is ignored when running as GitHub action due to GitHub workflows more powerful [`on` conditions](https://help.github.com/en/actions/reference/workflow-syntax-for-github-actions#on)

References takes an list and accepts strings and regex.
If none are specified, we default to the repository’s default branch usually master.

```yaml
references:
  - master
  - v.+
```

Currently matching against any `ref/heads/` and `ref/tags/` references behind the scene

## Categorize Changes

Changes are automatically categorized based on semantic commit types. The default categories are:

- **Breaking Changes** - commits with `!` suffix or `BREAKING CHANGE:` in body
- **Features** - `feat:` commits
- **Bug Fixes** - `fix:` commits
- **Documentation** - `docs:` commits
- **Maintenance** - `chore:`, `refactor:`, `test:`, `ci:`, `build:`, `perf:`, `style:` commits

You can customize category titles in your `release-drafter.yml` using the `categories` option with `commit-types` instead of `labels`:

```yml
categories:
  - title: 'New Features'
    commit-types:
      - 'feat'
  - title: 'Bug Fixes'
    commit-types:
      - 'fix'
```

## Exclude Contributors

By default, the `$CONTRIBUTORS` variable will contain the names or usernames of all the contributors of a release. The `exclude-contributors` option allows you to remove certain usernames from that list. This can be useful if don't wish to include yourself, to better highlight only the third-party contributions.

```yml
exclude-contributors:
  - 'myusername'
```

## Replacers

You can search and replace content in the generated changelog body, using regular expressions, with the `replacers` option. Each replacer is applied in order.

```yml
replacers:
  - search: '/CVE-(\d{4})-(\d+)/g'
    replace: 'https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-$1-$2'
  - search: 'myname'
    replace: 'My Name'
```

## Prerelease increment

When creating prerelease (`prerelease: true`), you can add a prerelease identifier to increment the prerelease version number, with the `prerelease-identifier` option. It accept any string, but it's recommended to use [Semantic Versioning](https://semver.org/) prerelease identifiers (alpha, beta, rc, etc).

Using `prerelease-identifier` automatically enable `include-prereleases`.

```yml
prerelease-identifier: 'alpha' # will create a prerelease with version number x.x.x-alpha.x
```

## Projects that don't use Semantic Versioning

If your project doesn't follow [Semantic Versioning](https://semver.org) you can still use Release Drafter, but you may want to set the `version-template` option to customize how the `$NEXT_{PATCH,MINOR,MAJOR}_VERSION` environment variables are generated.

For example, if your project doesn't use patch version numbers, you can set `version-template` to `$MAJOR.$MINOR`. If the current release is version 1.0, then `$NEXT_MINOR_VERSION` will be `1.1`.

## Attaching Files to Releases

The `attach-files` input allows you to automatically attach build artifacts (e.g., wheels, sdists, binaries) to your draft release. This provides a single-step, idempotent experience for managing release assets.

### Basic Usage

```yaml
- uses: aaronsteers/semantic-pr-release-drafter@main
  with:
    attach-files: |
      dist/*.tar.gz
      dist/*.whl
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### How It Works

When `attach-files` is set:

1. After the draft release is created or updated, the action identifies all existing assets on the release
2. All existing assets are deleted (ensuring full idempotency, even when artifact names change)
3. The glob patterns are expanded and all matching files are uploaded as release assets
4. If no files match the patterns, the action fails with a clear error message

### Supported Patterns

The `attach-files` input accepts:

- Single file paths: `dist/mypackage-1.0.0.tar.gz`
- Glob patterns: `dist/*.whl`
- Brace expansion: `dist/*.{whl,tar.gz}`
- Multiple patterns (newline-separated):
  ```yaml
  attach-files: |
    dist/*.tar.gz
    dist/*.whl
    bin/myapp
  ```

Paths are resolved relative to `GITHUB_WORKSPACE`.

### Permissions

When using `attach-files`, ensure your `GITHUB_TOKEN` has `contents: write` permission:

```yaml
permissions:
  contents: write
```

### Replacing Multi-Step Workflows

This feature replaces the common pattern of using multiple actions to manage release assets:

```yaml
# Before: Multiple steps required
- name: Create or update draft release
  uses: aaronsteers/semantic-pr-release-drafter@main
  id: release-drafter
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

- name: Delete existing release assets
  uses: andreaswilli/delete-release-assets-action@v4.0.0
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    tag: ${{ steps.release-drafter.outputs.tag_name }}
    deleteOnlyFromDrafts: true

- name: Upload assets to draft release
  uses: svenstaro/upload-release-action@v2
  with:
    repo_token: ${{ secrets.GITHUB_TOKEN }}
    file: dist/*.{whl,tar.gz}
    release_id: ${{ steps.release-drafter.outputs.id }}
    overwrite: true
    file_glob: true
    draft: true

# After: Single step with attach-files
- name: Create or update draft release
  uses: aaronsteers/semantic-pr-release-drafter@main
  with:
    attach-files: |
      dist/*.tar.gz
      dist/*.whl
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Action Inputs

See [action.yml](action.yml) for the full list of supported inputs and their descriptions.

## Action Outputs

The action sets the following outputs which can be used in subsequent workflow steps:

| Output             | Description                                                                        |
| ------------------ | ---------------------------------------------------------------------------------- |
| `id`               | The ID of the release that was created or updated.                                 |
| `name`             | The name of this release.                                                          |
| `tag_name`         | The name of the tag associated with this release.                                  |
| `body`             | The body of the drafted release.                                                   |
| `html_url`         | The URL to view the release.                                                       |
| `upload_url`       | The URL for uploading assets to the release.                                       |
| `resolved_version` | Version resolved by [Version Resolver](#version-resolver), e.g. `6.3.1`.           |
| `major_version`    | Major part of resolved version by [Version Resolver](#version-resolver), e.g. `6`. |
| `minor_version`    | Minor part of resolved version by [Version Resolver](#version-resolver), e.g. `3`. |
| `patch_version`    | Patch part of resolved version by [Version Resolver](#version-resolver), e.g. `1`. |

## Developing

```sh
# Install dependencies
yarn install

# Run the tests
yarn test

# Run tests in watch mode
yarn test:watch
```

## Contributing

Third-party contributions are welcome! 🙏🏼 See [CONTRIBUTING.md](CONTRIBUTING.md) for step-by-step instructions.

If you need help or have a question, let me know via a GitHub issue.

## Deployment

If you want to deploy your own copy of Release Drafter, follow the [Probot Deployment Guide](https://probot.github.io/docs/deployment/).

## Releasing

Run the following command:

```bash
git checkout main && git pull && npm version [major | minor | patch]
```

The command does the following:

- Ensures you're on main and don't have local, uncommitted changes
- Bumps the version number in [package.json](package.json) based on major, minor or patch
- Runs the `postversion` npm script in [package.json](package.json), which:
  - Runs test
  - Pushes the tag to GitHub, which triggers GitHub Action that does the following:
    - Releases NPM
    - Publish the Release Draft!
