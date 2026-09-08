# Hyper for Visual Studio Code

Syntax highlighting and editor basics for the [Hyper](https://github.com/hyperlangg/hyper) programming language (`.hyp` files).

## Features

- **Python-colored** constructs that Hyper shares with Python (`if` / `elif` / `else`, `for` / `while`, `import`, `def`, `raise`, lists, strings, f-strings, `and` / `or` / `not`, `None`, …)
- **Rust-colored** constructs that Hyper shares with Rust but not Python (`fn`, `struct`, `trait`, `let`, `mut`, `pub`, `ref`, `i32` / `f64` / `bool`, `true` / `false`, …)
- Hyper-only leftovers (`@parallel`, `@vectorize`, `raises`, `handle`, `string`, `Array` / `Dict`, …) use nearby Python or type-name colors
- Comment (`#`), indentation, and bracket helpers aligned with Hyper’s Python-shaped syntax

## Install (development)

1. Open this folder in VS Code / Cursor
2. Press `F5` (or run **Extension: Extension**) to launch an Extension Development Host
3. Open any `.hyp` file — language mode should be **Hyper**

## File association

Files ending in `.hyp` are associated with the `hyper` language id automatically. Explorer, tabs, and the language picker use the Hyper ladder logo.

If a third-party file icon theme still shows a generic document, it is overriding language icons — switch to the default Seti theme, or map `.hyp` to Hyper in that theme’s settings.

## Color mapping (overview)

| Construct | Colored like | Scope family |
|-----------|--------------|--------------|
| `if` / `for` / `import` / `def` / `raise` / `None` | Python | `keyword.control.*`, `storage.type.function`, `constant.language` |
| `and` / `or` / `not` | Python | `keyword.operator.logical` |
| strings / f-strings / `#` comments | Python | `string.quoted`, `string.interpolated`, `comment.line.number-sign` |
| `fn` | Rust | `keyword.other.fn.rust` |
| `struct` / `trait` | Rust | `keyword.declaration.struct/trait.rust` |
| `let` / `mut` / `pub` / `ref` | Rust | `storage.type.rust`, `storage.modifier.mut/visibility.rust`, `keyword.other.rust` |
| `i32` / `f64` / `bool` | Rust | `entity.name.type.numeric/primitive.rust` |
| `true` / `false` | Rust | `constant.language.bool.rust` |
| `@parallel` / `raises` / `handle` / `string` / `Array` | Hyper-only | decorator / exception / type scopes |

## License

Same dual license spirit as Hyper (MIT / Apache-2.0) — adjust when you publish.
