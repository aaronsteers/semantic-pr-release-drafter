# Monorepo Release Demo

This demo shows the recommended pattern for independent release drafting inside a monorepo.

Each releasable project gets its own release-drafter configuration. Existing projects can keep the repository's original unprefixed tag family, while newly added packages should use slash-delimited tag namespaces:

- `demo-project/existing-project` keeps tags like `v1.2.3`
- `demo-project/package-a` releases from tags like `package-a/v1.2.3`
- `demo-project/package-b` releases from tags like `package-b/v4.5.6`

Run one action invocation per package, typically with a GitHub Actions matrix. Each invocation should set:

- `config-name` to the package-specific config file.
- `tag-prefix` in that config to the package tag namespace, or omit it for the existing unprefixed project.
- `include-paths` in that config to the project directory and any shared files that should trigger that project's release notes.

This lets each project calculate a next version from only the commits that touched that project, while ignoring unrelated commits elsewhere in the repository. `include-paths` is selection-only today; it does not support negated paths such as `!demo-project/package-a`.
