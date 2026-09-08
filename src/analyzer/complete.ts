import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
} from "vscode-languageserver/node";
import { Binding, formatType } from "./semantic";

const KEYWORDS: Array<{ label: string; snippet?: string; detail: string }> = [
  { label: "let", snippet: "let ${1:name} = ${2:0}", detail: "immutable binding" },
  { label: "let mut", snippet: "let mut ${1:name} = ${2:0}", detail: "mutable binding" },
  { label: "fn", snippet: "fn ${1:name}(${2}) -> ${3:i32}:\n\t${0}", detail: "function" },
  { label: "def", snippet: "def ${1:name}(${2}):\n\t${0}", detail: "function (def)" },
  { label: "struct", snippet: "struct ${1:Name}:\n\t${0}", detail: "struct" },
  { label: "trait", snippet: "trait ${1:Name}:\n\t${0}", detail: "trait" },
  { label: "if", snippet: "if ${1:cond}:\n\t${0}", detail: "if" },
  { label: "elif", snippet: "elif ${1:cond}:\n\t${0}", detail: "elif" },
  { label: "else", snippet: "else:\n\t${0}", detail: "else" },
  { label: "for", snippet: "for ${1:i} in range(${2:10}):\n\t${0}", detail: "for loop" },
  { label: "while", snippet: "while ${1:cond}:\n\t${0}", detail: "while loop" },
  { label: "return", snippet: "return ${0}", detail: "return" },
  { label: "raise", snippet: "raise ${0}", detail: "raise" },
  { label: "raises", detail: "function may raise" },
  { label: "handle", snippet: "handle ${1:expr} else ${0}", detail: "recover from raise" },
  { label: "pub", detail: "public" },
  { label: "ref", detail: "reference parameter" },
  { label: "mut", detail: "mutable" },
  { label: "import", snippet: "import ${1:module}", detail: "import module" },
  { label: "from", snippet: "from ${1:module} import ${2:name}", detail: "import names" },
  { label: "with", snippet: "with ${1:open} as ${2:f}:\n\t${0}", detail: "with resource" },
  { label: "true", detail: "bool" },
  { label: "false", detail: "bool" },
  { label: "None", detail: "None" },
  { label: "and", detail: "logical and" },
  { label: "or", detail: "logical or" },
  { label: "not", detail: "logical not" },
  { label: "in", detail: "iteration" },
  { label: "break", detail: "break loop" },
  { label: "continue", detail: "continue loop" },
  { label: "@parallel", snippet: "@parallel\nfor ${1:i} in range(${2}):\n\t${0}", detail: "parallel for" },
  { label: "@vectorize", snippet: "@vectorize\nfor ${1:i} in range(${2}):\n\t${0}", detail: "vectorized for" },
];

const TYPES = ["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "f32", "f64", "string", "bool", "Array", "Dict"];

function bindingKind(kind: Binding["kind"]): CompletionItemKind {
  switch (kind) {
    case "function":
    case "builtin":
      return CompletionItemKind.Function;
    case "struct":
      return CompletionItemKind.Struct;
    case "trait":
      return CompletionItemKind.Interface;
    case "param":
      return CompletionItemKind.Variable;
    default:
      return CompletionItemKind.Variable;
  }
}

export function completions(source: string, offset: number, symbols: Binding[]): CompletionItem[] {
  const before = source.slice(0, offset);
  const line = before.split("\n").pop() ?? "";
  const items: CompletionItem[] = [];

  const afterColon = /:\s*[A-Za-z0-9_]*$/.test(line);
  const afterArrow = /->\s*[A-Za-z0-9_]*$/.test(line);
  const afterDot = /([A-Za-z_][A-Za-z0-9_]*)\.\s*[A-Za-z0-9_]*$/.exec(line);

  if (afterColon || afterArrow) {
    TYPES.forEach((t) => {
      items.push({
        label: t,
        kind: CompletionItemKind.TypeParameter,
        detail: "Hyper type",
        insertText: t,
      });
    });
    symbols
      .filter((s) => s.kind === "struct" || s.kind === "trait")
      .forEach((s) => {
        items.push({
          label: s.name,
          kind: s.kind === "struct" ? CompletionItemKind.Struct : CompletionItemKind.Interface,
          detail: formatType(s.ty),
        });
      });
    return items;
  }

  if (afterDot) {
    ["len", "append", "keys", "upper", "lower", "strip", "split", "replace", "speak", "read"].forEach((m) => {
      items.push({
        label: m,
        kind: CompletionItemKind.Method,
        insertText: `${m}($0)`,
        insertTextFormat: InsertTextFormat.Snippet,
        detail: "method",
      });
    });
    return items;
  }

  KEYWORDS.forEach((kw) => {
    items.push({
      label: kw.label,
      kind: CompletionItemKind.Keyword,
      detail: kw.detail,
      insertText: kw.snippet ?? kw.label,
      insertTextFormat: kw.snippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
    });
  });

  const seen = new Set<string>();
  for (let i = symbols.length - 1; i >= 0; i -= 1) {
    const s = symbols[i]!;
    if (seen.has(s.name)) {
      continue;
    }
    seen.add(s.name);
    items.push({
      label: s.name,
      kind: bindingKind(s.kind),
      detail: `${s.mutable ? "mut " : ""}${formatType(s.ty)}`,
      insertText: s.kind === "function" || s.kind === "builtin" ? `${s.name}($0)` : s.name,
      insertTextFormat: s.kind === "function" || s.kind === "builtin" ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
    });
  }

  return items;
}
