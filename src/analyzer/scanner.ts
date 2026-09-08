import { AnalyzerDiagnostic, Span } from "./ast";

export type TokenType =
  | "Indent"
  | "Dedent"
  | "Newline"
  | "Eof"
  | "LeftParen"
  | "RightParen"
  | "LeftBrace"
  | "RightBrace"
  | "LeftBracket"
  | "RightBracket"
  | "Colon"
  | "Comma"
  | "Dot"
  | "Minus"
  | "Plus"
  | "Semicolon"
  | "Slash"
  | "FloorDiv"
  | "Star"
  | "StarStar"
  | "Percent"
  | "PlusEqual"
  | "MinusEqual"
  | "StarEqual"
  | "StarStarEqual"
  | "SlashEqual"
  | "PercentEqual"
  | "Bang"
  | "BangEqual"
  | "Equal"
  | "EqualEqual"
  | "Greater"
  | "GreaterEqual"
  | "Less"
  | "LessEqual"
  | "Arrow"
  | "At"
  | "Identifier"
  | "String"
  | "FString"
  | "Number"
  | "True"
  | "False"
  | "None"
  | "And"
  | "Or"
  | "Not"
  | "If"
  | "Elif"
  | "Else"
  | "Def"
  | "Fn"
  | "Ref"
  | "While"
  | "For"
  | "In"
  | "Range"
  | "Return"
  | "Break"
  | "Continue"
  | "Raise"
  | "Raises"
  | "Handle"
  | "Struct"
  | "Trait"
  | "Pub"
  | "Let"
  | "Mut"
  | "With"
  | "As"
  | "Import"
  | "From"
  | "Array"
  | "Dict";

const KEYWORDS: Record<string, TokenType> = {
  true: "True",
  false: "False",
  None: "None",
  and: "And",
  or: "Or",
  not: "Not",
  if: "If",
  elif: "Elif",
  else: "Else",
  def: "Def",
  fn: "Fn",
  ref: "Ref",
  while: "While",
  for: "For",
  in: "In",
  range: "Range",
  return: "Return",
  break: "Break",
  continue: "Continue",
  raise: "Raise",
  raises: "Raises",
  handle: "Handle",
  struct: "Struct",
  trait: "Trait",
  pub: "Pub",
  let: "Let",
  mut: "Mut",
  with: "With",
  as: "As",
  import: "Import",
  from: "From",
  array: "Array",
  Array: "Array",
  dict: "Dict",
  Dict: "Dict",
};

export interface Token {
  type: TokenType;
  lexeme: string;
  span: Span;
}

export interface ScanResult {
  tokens: Token[];
  diagnostics: AnalyzerDiagnostic[];
}

function keywordType(ident: string): TokenType {
  return KEYWORDS[ident] ?? "Identifier";
}

export function scan(source: string): ScanResult {
  const tokens: Token[] = [];
  const diagnostics: AnalyzerDiagnostic[] = [];
  let i = 0;
  let line = 1;
  const indentStack = [0];
  let atLineStart = true;
  let lineAllowsIndent = false;

  const peek = (n = 0): string | undefined => source[i + n];
  const isAtEnd = (): boolean => i >= source.length;

  const makeSpan = (start: number, end: number, tokLine: number): Span => ({
    start,
    end,
    line: tokLine,
  });

  const add = (type: TokenType, start: number, end: number, tokLine: number, lexeme?: string): void => {
    tokens.push({
      type,
      lexeme: lexeme ?? source.slice(start, end),
      span: makeSpan(start, end, tokLine),
    });
  };

  const error = (kind: AnalyzerDiagnostic["kind"], tokLine: number, start: number, end: number, message: string): void => {
    diagnostics.push({ kind, message, span: makeSpan(start, Math.max(end, start + 1), tokLine) });
  };

  const scanString = (start: number, isFString: boolean): void => {
    const strLine = line;
    while (!isAtEnd() && peek() !== '"') {
      if (peek() === "\\") {
        i += 1;
        if (!isAtEnd()) {
          i += 1;
        }
        continue;
      }
      if (peek() === "\n") {
        line += 1;
      }
      i += 1;
    }
    if (isAtEnd()) {
      error("SyntaxError", strLine, start, i, "unterminated string");
      add(isFString ? "FString" : "String", start, i, strLine);
      return;
    }
    i += 1;
    add(isFString ? "FString" : "String", start, i, strLine);
  };

  const matchChar = (ch: string, start: number): void => {
    switch (ch) {
      case " ":
      case "\t":
      case "\r":
        return;
      case "\n":
        line += 1;
        atLineStart = true;
        add("Newline", start, i, line - 1, "\\n");
        return;
      case "(":
        add("LeftParen", start, i, line);
        return;
      case ")":
        add("RightParen", start, i, line);
        return;
      case "{":
        add("LeftBrace", start, i, line);
        return;
      case "}":
        add("RightBrace", start, i, line);
        return;
      case "[":
        add("LeftBracket", start, i, line);
        return;
      case "]":
        add("RightBracket", start, i, line);
        return;
      case ":":
        add("Colon", start, i, line);
        lineAllowsIndent = true;
        return;
      case "@":
        add("At", start, i, line);
        return;
      case ".":
        add("Dot", start, i, line);
        return;
      case ",":
        add("Comma", start, i, line);
        return;
      case ";":
        add("Semicolon", start, i, line);
        return;
      case "+":
        if (peek() === "=") {
          i += 1;
          add("PlusEqual", start, i, line);
        } else {
          add("Plus", start, i, line);
        }
        return;
      case "-":
        if (peek() === ">") {
          i += 1;
          add("Arrow", start, i, line);
        } else if (peek() === "=") {
          i += 1;
          add("MinusEqual", start, i, line);
        } else {
          add("Minus", start, i, line);
        }
        return;
      case "%":
        if (peek() === "=") {
          i += 1;
          add("PercentEqual", start, i, line);
        } else {
          add("Percent", start, i, line);
        }
        return;
      case "*":
        if (peek() === "=") {
          i += 1;
          add("StarEqual", start, i, line);
        } else if (peek() === "*") {
          i += 1;
          if (peek() === "=") {
            i += 1;
            add("StarStarEqual", start, i, line);
          } else {
            add("StarStar", start, i, line);
          }
        } else {
          add("Star", start, i, line);
        }
        return;
      case "=":
        if (peek() === "=") {
          i += 1;
          add("EqualEqual", start, i, line);
        } else {
          add("Equal", start, i, line);
        }
        return;
      case "!":
        if (peek() === "=") {
          i += 1;
          add("BangEqual", start, i, line);
        } else {
          add("Bang", start, i, line);
        }
        return;
      case "<":
        if (peek() === "=") {
          i += 1;
          add("LessEqual", start, i, line);
        } else {
          add("Less", start, i, line);
        }
        return;
      case ">":
        if (peek() === "=") {
          i += 1;
          add("GreaterEqual", start, i, line);
        } else {
          add("Greater", start, i, line);
        }
        return;
      case "/":
        if (peek() === "=") {
          i += 1;
          add("SlashEqual", start, i, line);
        } else if (peek() === "/") {
          i += 1;
          add("FloorDiv", start, i, line);
        } else {
          add("Slash", start, i, line);
        }
        return;
      case "#":
        while (!isAtEnd() && peek() !== "\n") {
          i += 1;
        }
        return;
      case '"':
        scanString(start, false);
        return;
      default:
        if (ch >= "0" && ch <= "9") {
          while (!isAtEnd() && ((peek() ?? "").match(/[0-9_]/) || peek() === ".")) {
            if (peek() === ".") {
              const next = peek(1);
              if (next && next >= "0" && next <= "9") {
                i += 1;
                while (!isAtEnd() && (peek() ?? "").match(/[0-9_]/)) {
                  i += 1;
                }
              }
              break;
            }
            i += 1;
          }
          if (!isAtEnd() && (peek() === "e" || peek() === "E")) {
            i += 1;
            if (peek() === "+" || peek() === "-") {
              i += 1;
            }
            while (!isAtEnd() && (peek() ?? "").match(/[0-9_]/)) {
              i += 1;
            }
          }
          add("Number", start, i, line);
          return;
        }
        if (/[A-Za-z_]/.test(ch)) {
          if ((ch === "f" || ch === "F") && peek() === '"') {
            i += 1;
            scanString(start, true);
            return;
          }
          while (!isAtEnd() && /[A-Za-z0-9_]/.test(peek() ?? "")) {
            i += 1;
          }
          const ident = source.slice(start, i);
          add(keywordType(ident), start, i, line, ident);
          return;
        }
        error("SyntaxError", line, start, i, `unexpected character: '${ch}'`);
    }
  };

  while (!isAtEnd()) {
    if (atLineStart) {
      const lineStart = i;
      let indentLevel = 0;
      let usedTab = false;
      let usedSpace = false;
      while (!isAtEnd() && (peek() === " " || peek() === "\t")) {
        if (peek() === " ") {
          usedSpace = true;
          indentLevel += 1;
        } else {
          usedTab = true;
          indentLevel += 4;
        }
        i += 1;
      }
      if (usedTab && usedSpace) {
        error("IndentationError", line, lineStart, i, "indent contains mixed spaces and tabs");
      }
      if (peek() === "\r") {
        i += 1;
      }
      if (peek() === "\n") {
        i += 1;
        line += 1;
        continue;
      }
      if (peek() === "#") {
        while (!isAtEnd() && peek() !== "\n") {
          i += 1;
        }
        if (peek() === "\r") {
          i += 1;
        }
        if (peek() === "\n") {
          i += 1;
          line += 1;
        }
        continue;
      }
      const currentIndent = indentStack[indentStack.length - 1] ?? 0;
      if (indentLevel > currentIndent) {
        if (indentLevel > 0 && currentIndent === 0 && !lineAllowsIndent) {
          error("IndentationError", line, lineStart, i, "unexpected indent");
        } else {
          indentStack.push(indentLevel);
          add("Indent", lineStart, i, line, "INDENT");
        }
      } else if (indentLevel < currentIndent) {
        while ((indentStack[indentStack.length - 1] ?? 0) > indentLevel) {
          indentStack.pop();
          add("Dedent", lineStart, i, line, "DEDENT");
        }
        if ((indentStack[indentStack.length - 1] ?? 0) !== indentLevel) {
          error(
            "IndentationError",
            line,
            lineStart,
            i,
            "unindent does not match any outer indentation level",
          );
        }
      }
      lineAllowsIndent = false;
      atLineStart = false;
      if (isAtEnd()) {
        break;
      }
      const ch = source[i];
      i += 1;
      matchChar(ch, i - 1);
      continue;
    }
    const ch = source[i];
    i += 1;
    matchChar(ch, i - 1);
  }

  while (indentStack.length > 1) {
    indentStack.pop();
    add("Dedent", i, i, line, "DEDENT");
  }
  add("Eof", i, i, line, "");
  return { tokens, diagnostics };
}
