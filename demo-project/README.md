# Monorepo Release Demo

This demo shows the recommended pattern for independent release drafting inside a monorepo.

Each package gets its own release-drafter configuration and its own slash-delimited tag family:

- `demo-project/package-a` releases from tags like `package-a/v1.2.3`
- `demo-project/package-b` releases from tags like `package-b/v4.5.6`

Run one action invocation per package, typically with a GitHub Actions matrix. Each invocation should set:

- `config-name` to the package-specific config file.
- `tag-prefix` in that config to the package tag namespace.
- `include-paths` in that config to the package directory and any shared files that should trigger that package's release notes.

This lets each package calculate a next version from only the commits that touched that package, while ignoring unrelated commits elsewhere in the repository.
