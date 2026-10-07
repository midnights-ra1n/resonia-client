# Releasing Resonia

A quick guide to shipping a new version, from `development` to `beta` to `stable`.

## How it works

| Branch | Role | Version format | What happens on push |
| --- | --- | --- | --- |
| `development` | Day-to-day work | anything | CI only (lint, tests, build) |
| `beta` | Pre-releases | `X.Y.Z-beta.N` | **Release workflow**: GitHub pre-release + Docker `:beta` and `:latest` |
| `stable` | Public releases | `X.Y.Z` | **Release workflow**: GitHub release + Docker `:latest` |

The [Release workflow](.github/workflows/release.yml) runs on its own when you push to `beta` or `stable`. It reads the version from the root `package.json` and:

1. Checks that the version fits the branch (a beta version on `beta`, a stable version on `stable`) and that its `CHANGELOG.md` section exists. Both checks fail within seconds.
2. Runs lint and tests, then builds the web version, the Docker image (amd64 and arm64) and the desktop apps (macOS Apple Silicon, Windows x64/ARM64, Linux x86_64/ARM64).
3. Checks that the auto-update manifests and the README download links point to real files.
4. Creates the GitHub release with the changelog section as its notes, uploads everything, then makes it public.
5. Moves the Docker tags (`:latest`, plus `:beta` for pre-releases).

If any platform fails, nothing is published. If the version's tag already exists, the workflow does nothing, so a push without a version bump is harmless.

The changelog section is also what users see in the app's update pop-up, so write it for them.

## 1. `development` → `beta`

1. **Write the release notes.** In `CHANGELOG.md`, rename `## [Unreleased]` to the new version and add a fresh `## [Unreleased]` above it:

   ```markdown
   ## [Unreleased]

   ## 1.0.0-beta.6
   - Added …
   - Fixed …
   ```

   The heading must match the version exactly, without the `v` prefix.

2. **Bump the version.**

   ```bash
   pnpm bump 1.0.0-beta.6
   ```

   This updates both `package.json` files and regenerates the download links in `README.md`. It also warns you if the changelog section is missing.

3. **Commit and push to `development`.**

   ```bash
   git add package.json apps/client/package.json CHANGELOG.md README.md
   git commit -m "bump version to 1.0.0-beta.6"
   git push origin development
   ```

4. **Open a pull request from `development` into `beta`.** On PRs that target `beta` or `stable`, CI also packages the desktop app on all three OSes and builds the Docker image. Packaging problems show up here, before anything is released.

5. **Merge the PR.** The push to `beta` starts the Release workflow. It takes about 15–20 minutes. Follow it in **Actions → Release**.

## 2. `beta` → `stable`

The `beta` branch only accepts beta versions, so the stable bump happens on a short-lived branch.

1. **Create a release branch from `beta`.**

   ```bash
   git switch beta && git pull
   git switch -c release/1.0.0
   ```

2. **Write the release notes.** Add a `## 1.0.0` section to `CHANGELOG.md` that sums up all the betas since the last stable release.

3. **Bump and push.**

   ```bash
   pnpm bump 1.0.0
   git add package.json apps/client/package.json CHANGELOG.md README.md
   git commit -m "bump version to 1.0.0"
   git push -u origin release/1.0.0
   ```

4. **Open a pull request from `release/1.0.0` into `stable`** and merge it once CI is green. The push to `stable` starts the Release workflow.

5. **Bring the changes back into `development`.**

   ```bash
   git switch development && git pull
   git merge stable
   git push origin development
   ```

   Do **not** merge `stable` straight into `beta`: a stable version on `beta` makes the Release workflow fail. The next beta reaches `beta` from `development`, with its own bump (e.g. `1.0.1-beta.1`).

## Dry run

To check that everything builds without publishing anything: **Actions → Release → Run workflow**, pick any branch, and leave **publish** unchecked. The build files are kept as workflow artifacts for 14 days.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| *"La branche 'beta' attend une version beta"* (or `stable`) | The version doesn't match the branch. Run `pnpm bump` with the right version and push again. |
| *"CHANGELOG.md n'a pas de section…"* | Add the `## X.Y.Z` section, commit and push again. |
| *"README.md lie … absent des fichiers construits"* | A file name changed, or the README wasn't regenerated. Run `pnpm bump <version>` again, or update `scripts/readme-downloads.mjs` if electron-builder changed its naming. |
| A build or upload failed | Nothing was published. Use **Re-run failed jobs** on the run. A leftover draft release is cleaned up automatically. |
| Only the Docker promotion failed, after the release went public | **Re-run failed jobs**. The workflow detects that the release is already published and only moves the Docker tags. |
| The version was already released | The workflow skips the run. Bump to a new version. |
