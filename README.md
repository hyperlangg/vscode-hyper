# Hyper for Visual Studio Code

Language support for [Hyper](https://github.com/hyperlangg/hyper) in Visual Studio Code and compatible editors. Open a `.hyp` file and the extension activates Hyper Analyzer, a language server bundled with this extension.

## Features

* Syntax highlighting
* Completions
* Diagnostics
* Hover
* Go to Definition
* Find All References
* Document symbols and outline
* Comment, bracket, and indentation editing
* File icons for `.hyp`

## Requirements

* Visual Studio Code 1.85 or newer, or an editor compatible with that API
* The [Hyper](https://github.com/hyperlangg/hyper) toolchain if you want to compile and run programs

Editing, highlighting, and Hyper Analyzer do not require a separate language-server install.

## Quick start

1. Install Hyper if you plan to build programs.
2. Install this extension from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=hyperlangg.hyper), or from a VSIX with `code --install-extension hyper-0.1.0.vsix`.
3. Open a `.hyp` file, or create one and set the language mode to **Hyper**.

The editor should highlight the file, show completions as you type, and report problems in the **Problems** panel.

## Completions

Suggestions include keywords, names in scope, types after `:` or `->`, and methods after `.`. Trigger them from the editor or with **Trigger Suggest**.

## Diagnostics

Hyper Analyzer checks the buffer as you edit. Errors appear as squiggles, on hover, and in **Problems**. Reported kinds match Hyper itself (`SyntaxError`, `IndentationError`), including immutable reassignment, `raise` without `raises`, `break` outside a loop, division by zero, undefined names, trait conformance, and typed bindings that must use `let`.

## Hover

Hold the pointer over a name or an error to see the type, mutability, or diagnostic message. You can also use **Show or Focus Hover**.

## Code navigation

* **Go to Definition** jumps to the binding
* **Find All References** lists uses of that name
* **Go to Symbol in Editor** and the **Outline** view list functions, structs, traits, and other symbols in the file

## Configuration

Settings live under **Hyper** in the editor settings UI (`hyper-analyzer.*`).

* `hyper-analyzer.trace.server` — trace communication with Hyper Analyzer (`off`, `messages`, or `verbose`)

## Contributing

Bug reports and pull requests are welcome on [hyperlangg/vscode-hyper](https://github.com/hyperlangg/vscode-hyper).

To run the extension from source:

1. Clone the repository and run `npm install`.
2. Run `npm test`.
3. Press `F5` to launch an Extension Development Host.
4. Open a `.hyp` file in that window.

`npm run package` produces a VSIX.

## License

Licensed under MIT or Apache-2.0, at your option. See [LICENSE](LICENSE), [LICENSE-MIT](LICENSE-MIT), and [LICENSE-APACHE](LICENSE-APACHE).
