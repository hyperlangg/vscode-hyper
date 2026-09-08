# Contributing

Thanks for helping improve Hyper in Visual Studio Code.

This file is for people who want to report bugs, change the extension, or run it from source. If you only want to use it, see [README.md](README.md).

## Before you start coding

Search existing [issues](https://github.com/hyperlangg/vscode-hyper/issues) before opening a new one.

For a non-trivial change, file an issue first and wait for agreement on the direction. If you want to take an existing issue, comment on it so work is not duplicated.

### Bug reports

Include enough to reproduce the problem:

* Summary
* What you expected and what happened
* Editor version (Visual Studio Code, Cursor, or other)
* Extension version
* Operating system
* A small `.hyp` sample when the bug is about highlighting or Hyper Analyzer

## Repository layout

* `src/extension.ts` — editor client; starts Hyper Analyzer
* `src/server.ts` — language server (completions, diagnostics, hover, navigation)
* `src/analyzer/` — scanner, parser, type checker, completions, and symbol queries
* `src/test/` — analyzer tests
* `syntaxes/` — TextMate grammar for `.hyp`
* `language-configuration.json` — comments, brackets, indentation

Hyper Analyzer lives in this repo. You do not install a separate language server to develop the extension.

## Setup

1. Install a current [Node.js](https://nodejs.org/) (includes `npm`).
2. Clone the repository and install dependencies:

```bash
git clone https://github.com/hyperlangg/vscode-hyper.git
cd vscode-hyper
npm install
```

3. Open the folder in Visual Studio Code or a compatible editor.

## Run

1. Open the Run view and select the **Extension** launch configuration, or press `F5`.
2. That compiles the project and opens an Extension Development Host window.
3. In that window, open a `.hyp` file and try your change.

After further edits, reload the Extension Development Host (`Ctrl+R` / `Cmd+R`). The debugger reattaches. You can set breakpoints in the TypeScript sources; compiled output is in `dist/`.

## Test

```bash
npm test
```

This typechecks the project and runs the analyzer tests. Run it before you open a pull request. Add coverage in `src/test/` when you change analyzer behavior. GitHub Actions runs the same command on `main` and on pull requests (Linux, Windows, and macOS).

## Logging

Set `hyper-analyzer.trace.server` to `messages` or `verbose` (default is `off`). Output appears in the **Hyper Analyzer** channel.

The debug launch configuration also starts the server with Node inspector on port `6009`.

## Sideload

To try a build as a normal extension instead of the development host:

1. Run `npm run package`. This runs tests and writes a `.vsix` file.
2. Disable or uninstall any already installed Hyper extension so you do not load two copies.
3. Install the VSIX from the Extensions view (**Install from VSIX…**) or:

```bash
code --install-extension hyper-0.1.0.vsix
```

## Releases

A GitHub Release always includes source archives. The `.vsix` is a built package; it is uploaded by [`.github/workflows/release.yml`](.github/workflows/release.yml) when you publish a release.

1. Set `version` in `package.json` (and `CHANGELOG.md`) to the release version.
2. Push a tag such as `v0.1.0` and publish a GitHub Release for that tag.
3. The workflow attaches `hyper-<version>.vsix` to **Assets**.

To attach a VSIX to a release that already exists, open **Actions → Release → Run workflow**, enter the tag (for example `v0.1.0`), and run it. You can also build locally and upload:

```bash
npm run package
gh release upload v0.1.0 hyper-0.1.0.vsix
```

## Commit Conventions

We follow standard commit message conventions to keep our git history clean, readable, and easy to parse automatically.

For guidelines on commit messages and history management, see [doc/COMMIT_CONVENTION.md](doc/COMMIT_CONVENTION.md).

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep the change focused.
3. Run `npm test`.
4. Open a pull request into `main` of [hyperlangg/vscode-hyper](https://github.com/hyperlangg/vscode-hyper).
5. Describe the problem and the fix. Link related issues.

Prefer clear TypeScript over comments. Comment only where a later contributor would otherwise struggle.
