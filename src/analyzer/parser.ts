import {
  AnalyzerDiagnostic,
  BinOp,
  CallArg,
  Expr,
  ForIter,
  ForKind,
  FunctionDecl,
  MethodDecl,
  Param,
  Span,
  Stmt,
  StructField,
  TypeAnn,
} from "./ast";
import { Token, TokenType, scan } from "./scanner";

export interface ParseResult {
  stmts: Stmt[];
  diagnostics: AnalyzerDiagnostic[];
  tokens: Token[];
}

const COMPOUND: Partial<Record<TokenType, BinOp>> = {
  PlusEqual: "Add",
  MinusEqual: "Sub",
  StarEqual: "Mul",
  SlashEqual: "Div",
  PercentEqual: "Rem",
  StarStarEqual: "Pow",
};

export function parse(source: string): ParseResult {
  const scanned = scan(source);
  const tokens = scanned.tokens;
  const diagnostics = [...scanned.diagnostics];
  let current = 0;

  const peek = (): Token => tokens[current] ?? tokens[tokens.length - 1]!;
  const previous = (): Token => tokens[Math.max(0, current - 1)]!;
  const isAtEnd = (): boolean => peek().type === "Eof";
  const check = (type: TokenType): boolean => peek().type === type;
  const checkAny = (...types: TokenType[]): boolean => types.includes(peek().type);

  const advance = (): Token => {
    if (!isAtEnd()) {
      current += 1;
    }
    return previous();
  };

  const skipNewlines = (): void => {
    while (check("Newline")) {
      advance();
    }
  };

  const errorAt = (token: Token, message: string): void => {
    diagnostics.push({
      kind: "SyntaxError",
      message: token.lexeme ? `at '${token.lexeme}': ${message}` : message,
      span: token.span,
    });
  };

  const consume = (type: TokenType, message: string): Token => {
    if (check(type)) {
      return advance();
    }
    errorAt(peek(), message);
    return peek();
  };

  const synchronize = (): void => {
    while (!isAtEnd() && !check("Newline") && !check("Dedent") && !check("Eof")) {
      advance();
    }
    if (check("Newline")) {
      advance();
    }
  };

  const identName = (token: Token): string => token.lexeme;

  const parseTypeName = (): string => {
    const tok = advance();
    let name = tok.lexeme;
    if (check("LeftBracket")) {
      advance();
      const inner: string[] = [];
      inner.push(parseTypeName());
      while (check("Comma")) {
        advance();
        inner.push(parseTypeName());
      }
      consume("RightBracket", "expected ']' after type arguments");
      name = `${name}[${inner.join(", ")}]`;
    }
    return name;
  };

  const parseTypeAnn = (): TypeAnn => {
    const name = parseTypeName();
    const array = name.match(/^Array\[(.+)\]$/i);
    if (array) {
      return { kind: "Array", inner: array[1] ?? "Any" };
    }
    const dict = name.match(/^Dict\[(.+),\s*(.+)\]$/i);
    if (dict) {
      return { kind: "Dict", key: dict[1] ?? "Any", value: dict[2] ?? "Any" };
    }
    return { kind: "Named", name };
  };

  const finishCall = (callee: Expr): Expr => {
    const args: CallArg[] = [];
    if (!check("RightParen")) {
      do {
        if (check("Identifier") && tokens[current + 1]?.type === "Colon") {
          const name = identName(advance());
          advance();
          args.push({ kind: "Named", name, value: parseExpression() });
        } else {
          args.push({ kind: "Positional", expr: parseExpression() });
        }
      } while (check("Comma") && (advance(), true));
    }
    const end = consume("RightParen", "expected ')' after arguments");
    return { kind: "Call", span: { start: callee.span.start, end: end.span.end, line: callee.span.line }, callee, args };
  };

  const parsePrefix = (): Expr => {
    const tok = peek();
    if (check("True") || check("False")) {
      advance();
      return { kind: "Literal", span: tok.span, lit: { kind: "Bool", value: tok.type === "True" } };
    }
    if (check("None")) {
      advance();
      return { kind: "Literal", span: tok.span, lit: { kind: "None" } };
    }
    if (check("Number")) {
      advance();
      return { kind: "Literal", span: tok.span, lit: { kind: "Number", value: tok.lexeme } };
    }
    if (check("String")) {
      advance();
      const raw = tok.lexeme;
      const value = raw.startsWith('"') ? raw.slice(1, -1) : raw;
      return { kind: "Literal", span: tok.span, lit: { kind: "String", value } };
    }
    if (check("FString")) {
      advance();
      return { kind: "FString", span: tok.span, parts: [{ kind: "Literal", value: tok.lexeme }] };
    }
    if (check("Not") || check("Bang") || check("Minus")) {
      const opTok = advance();
      const right = parsePrefix();
      const op = opTok.type === "Not" || opTok.type === "Bang" ? "Not" : "Neg";
      return { kind: "Unary", span: { start: opTok.span.start, end: right.span.end, line: opTok.span.line }, op, right };
    }
    if (check("Handle")) {
      const start = advance();
      const attempt = parseExpression();
      consume("Else", "expected 'else' after handle expression");
      const fallback = parseExpression();
      return {
        kind: "Handle",
        span: { start: start.span.start, end: fallback.span.end, line: start.span.line },
        attempt,
        fallback,
      };
    }
    if (check("LeftParen")) {
      const start = advance();
      const inner = parseExpression();
      const end = consume("RightParen", "expected ')' after expression");
      return { kind: "Group", span: { start: start.span.start, end: end.span.end, line: start.span.line }, inner };
    }
    if (check("LeftBracket")) {
      const start = advance();
      const items: Expr[] = [];
      if (!check("RightBracket")) {
        do {
          items.push(parseExpression());
        } while (check("Comma") && (advance(), true));
      }
      const end = consume("RightBracket", "expected ']' after list");
      return { kind: "List", span: { start: start.span.start, end: end.span.end, line: start.span.line }, items };
    }
    if (check("LeftBrace")) {
      const start = advance();
      const entries: Array<[Expr, Expr]> = [];
      if (!check("RightBrace")) {
        do {
          const key = parseExpression();
          consume("Colon", "expected ':' in dict entry");
          const value = parseExpression();
          entries.push([key, value]);
        } while (check("Comma") && (advance(), true));
      }
      const end = consume("RightBrace", "expected '}' after dict");
      return { kind: "Dict", span: { start: start.span.start, end: end.span.end, line: start.span.line }, entries };
    }
    if (check("Identifier") || check("Range") || check("Array") || check("Dict")) {
      const nameTok = advance();
      return { kind: "Variable", span: nameTok.span, name: identName(nameTok) };
    }
    errorAt(tok, "expected expression");
    advance();
    return { kind: "Literal", span: tok.span, lit: { kind: "None" } };
  };

  const parseCallIndexMember = (): Expr => {
    let expr = parsePrefix();
    for (;;) {
      if (check("LeftParen")) {
        advance();
        expr = finishCall(expr);
        continue;
      }
      if (check("LeftBracket")) {
        advance();
        const index = parseExpression();
        const end = consume("RightBracket", "expected ']' after index");
        expr = {
          kind: "Index",
          span: { start: expr.span.start, end: end.span.end, line: expr.span.line },
          object: expr,
          index,
        };
        continue;
      }
      if (check("Dot")) {
        advance();
        const fieldTok = check("Identifier") ? advance() : peek();
        if (fieldTok.type !== "Identifier") {
          errorAt(peek(), "expected property name after '.'");
        } else if (!check("LeftParen")) {
          if (expr.kind === "Variable") {
            expr = {
              kind: "GetField",
              span: { start: expr.span.start, end: fieldTok.span.end, line: expr.span.line },
              object: expr.name,
              field: fieldTok.lexeme,
            };
          } else {
            expr = {
              kind: "CallMethod",
              span: { start: expr.span.start, end: fieldTok.span.end, line: expr.span.line },
              object: expr,
              method: fieldTok.lexeme,
              args: [],
            };
          }
          continue;
        } else {
          advance();
          const args: Expr[] = [];
          if (!check("RightParen")) {
            do {
              const arg = parseExpression();
              args.push(arg);
            } while (check("Comma") && (advance(), true));
          }
          const end = consume("RightParen", "expected ')' after method arguments");
          expr = {
            kind: "CallMethod",
            span: { start: expr.span.start, end: end.span.end, line: expr.span.line },
            object: expr,
            method: fieldTok.lexeme,
            args,
          };
          continue;
        }
      }
      break;
    }
    return expr;
  };

  const parsePow = (): Expr => {
    let expr = parseCallIndexMember();
    if (check("StarStar")) {
      advance();
      const right = parsePow();
      expr = { kind: "Binary", span: { start: expr.span.start, end: right.span.end, line: expr.span.line }, op: "Pow", left: expr, right };
    }
    return expr;
  };

  const parseMul = (): Expr => {
    let expr = parsePow();
    while (checkAny("Star", "Slash", "FloorDiv", "Percent")) {
      const opTok = advance();
      const op: BinOp =
        opTok.type === "Star" ? "Mul" : opTok.type === "Slash" ? "Div" : opTok.type === "FloorDiv" ? "FloorDiv" : "Rem";
      const right = parsePow();
      expr = { kind: "Binary", span: { start: expr.span.start, end: right.span.end, line: expr.span.line }, op, left: expr, right };
    }
    return expr;
  };

  const parseAdd = (): Expr => {
    let expr = parseMul();
    while (checkAny("Plus", "Minus")) {
      const opTok = advance();
      const right = parseMul();
      expr = {
        kind: "Binary",
        span: { start: expr.span.start, end: right.span.end, line: expr.span.line },
        op: opTok.type === "Plus" ? "Add" : "Sub",
        left: expr,
        right,
      };
    }
    return expr;
  };

  const parseCmp = (): Expr => {
    let expr = parseAdd();
    while (checkAny("EqualEqual", "BangEqual", "Less", "LessEqual", "Greater", "GreaterEqual")) {
      const opTok = advance();
      const map: Record<string, BinOp> = {
        EqualEqual: "Eq",
        BangEqual: "Ne",
        Less: "Lt",
        LessEqual: "Le",
        Greater: "Gt",
        GreaterEqual: "Ge",
      };
      const right = parseAdd();
      expr = {
        kind: "Binary",
        span: { start: expr.span.start, end: right.span.end, line: expr.span.line },
        op: map[opTok.type] ?? "Eq",
        left: expr,
        right,
      };
    }
    return expr;
  };

  const parseNot = (): Expr => {
    if (check("Not")) {
      const opTok = advance();
      const right = parseNot();
      return { kind: "Unary", span: { start: opTok.span.start, end: right.span.end, line: opTok.span.line }, op: "Not", right };
    }
    return parseCmp();
  };

  const parseAnd = (): Expr => {
    let expr = parseNot();
    while (check("And")) {
      advance();
      const right = parseNot();
      expr = { kind: "Binary", span: { start: expr.span.start, end: right.span.end, line: expr.span.line }, op: "And", left: expr, right };
    }
    return expr;
  };

  const parseOr = (): Expr => {
    let expr = parseAnd();
    while (check("Or")) {
      advance();
      const right = parseAnd();
      expr = { kind: "Binary", span: { start: expr.span.start, end: right.span.end, line: expr.span.line }, op: "Or", left: expr, right };
    }
    return expr;
  };

  const parseTernary = (): Expr => {
    let expr = parseOr();
    if (check("If")) {
      advance();
      const condition = parseOr();
      consume("Else", "expected 'else' in ternary expression");
      const elseBranch = parseTernary();
      expr = {
        kind: "Ternary",
        span: { start: expr.span.start, end: elseBranch.span.end, line: expr.span.line },
        condition,
        thenBranch: expr,
        elseBranch,
      };
    }
    return expr;
  };

  const parseExpression = (): Expr => parseAssign();

  const parseAssign = (): Expr => {
    const expr = parseTernary();
    if (check("Equal")) {
      advance();
      const value = parseAssign();
      if (expr.kind === "Variable") {
        return { kind: "Assign", span: { start: expr.span.start, end: value.span.end, line: expr.span.line }, name: expr.name, value };
      }
      if (expr.kind === "GetField") {
        return {
          kind: "SetField",
          span: { start: expr.span.start, end: value.span.end, line: expr.span.line },
          object: expr.object,
          field: expr.field,
          value,
        };
      }
      if (expr.kind === "Index") {
        return {
          kind: "IndexSet",
          span: { start: expr.span.start, end: value.span.end, line: expr.span.line },
          object: expr.object,
          index: expr.index,
          value,
        };
      }
      errorAt(peek(), "invalid assignment target");
      return value;
    }
    const compound = COMPOUND[peek().type];
    if (compound && expr.kind === "Variable") {
      advance();
      const value = parseAssign();
      const right: Expr = {
        kind: "Binary",
        span: { start: expr.span.start, end: value.span.end, line: expr.span.line },
        op: compound,
        left: expr,
        right: value,
      };
      return { kind: "Assign", span: right.span, name: expr.name, value: right };
    }
    return expr;
  };

  const parseBlock = (): Stmt => {
    skipNewlines();
    if (!check("Indent")) {
      errorAt(peek(), "expected indented block");
      return { kind: "Block", span: peek().span, stmts: [] };
    }
    const start = advance();
    const stmts: Stmt[] = [];
    while (!isAtEnd() && !check("Dedent") && !check("Eof")) {
      skipNewlines();
      if (check("Dedent") || check("Eof")) {
        break;
      }
      const stmt = parseStatement();
      if (stmt) {
        stmts.push(stmt);
      }
      skipNewlines();
    }
    const end = check("Dedent") ? advance() : peek();
    return { kind: "Block", span: { start: start.span.start, end: end.span.end, line: start.span.line }, stmts };
  };

  const parseParams = (): Param[] => {
    consume("LeftParen", "expected '(' after function name");
    const params: Param[] = [];
    if (!check("RightParen")) {
      do {
        const isRef = check("Ref") ? (advance(), true) : false;
        const nameTok = consume("Identifier", "expected parameter name");
        let typeAnn: string | undefined;
        if (check("Colon")) {
          advance();
          typeAnn = parseTypeName();
        }
        params.push({ name: nameTok.lexeme, isRef, typeAnn, span: nameTok.span });
      } while (check("Comma") && (advance(), true));
    }
    consume("RightParen", "expected ')' after parameters");
    return params;
  };

  const parseFunctionDecl = (startSpan: Span, isPub: boolean): FunctionDecl => {
    void isPub;
    const nameTok = consume("Identifier", "expected function name");
    const params = parseParams();
    let raises = false;
    let returnType: string | undefined;
    if (check("Raises")) {
      advance();
      raises = true;
    }
    if (check("Arrow")) {
      advance();
      returnType = parseTypeName();
    }
    if (check("Raises")) {
      advance();
      raises = true;
    }
    let body: Stmt;
    if (check("Colon")) {
      advance();
      body = parseBlock();
    } else {
      body = { kind: "Block", span: nameTok.span, stmts: [] };
    }
    return {
      name: nameTok.lexeme,
      isStrict: params.some((p) => !!p.typeAnn) || !!returnType,
      params,
      returnType,
      raises,
      body,
      span: { start: startSpan.start, end: body.span.end, line: startSpan.line },
    };
  };

  const parseIf = (): Stmt => {
    const start = advance();
    const condition = parseExpression();
    consume("Colon", "expected ':' after if condition");
    const thenBranch = parseBlock();
    skipNewlines();
    let elseBranch: Stmt | undefined;
    if (check("Elif")) {
      elseBranch = parseIf();
    } else if (check("Else")) {
      advance();
      consume("Colon", "expected ':' after else");
      elseBranch = parseBlock();
    }
    return {
      kind: "If",
      span: { start: start.span.start, end: (elseBranch ?? thenBranch).span.end, line: start.span.line },
      condition,
      thenBranch,
      elseBranch,
    };
  };

  const parseFor = (forKind: ForKind, atSpan?: Span): Stmt => {
    const start = check("For") ? advance() : peek();
    const spanStart = atSpan ?? start.span;
    const varTok = consume("Identifier", "expected loop variable");
    consume("In", "expected 'in' after for-loop variable");
    let iter: ForIter;
    if (check("Range")) {
      advance();
      consume("LeftParen", "expected '(' after range");
      const args: Expr[] = [];
      if (!check("RightParen")) {
        do {
          args.push(parseExpression());
        } while (check("Comma") && (advance(), true));
      }
      consume("RightParen", "expected ')' after range");
      if (args.length === 1) {
        iter = {
          kind: "Range",
          start: { kind: "Literal", span: args[0]!.span, lit: { kind: "Number", value: "0" } },
          end: args[0]!,
        };
      } else if (args.length >= 2) {
        iter = { kind: "Range", start: args[0]!, end: args[1]! };
      } else {
        errorAt(peek(), "range expects 1 to 3 arguments");
        iter = { kind: "Iterable", expr: { kind: "Literal", span: start.span, lit: { kind: "None" } } };
      }
    } else {
      iter = { kind: "Iterable", expr: parseExpression() };
    }
    consume("Colon", "expected ':' after for header");
    const body = parseBlock();
    return {
      kind: "For",
      span: { start: spanStart.start, end: body.span.end, line: spanStart.line },
      forKind,
      varName: varTok.lexeme,
      iter,
      body,
    };
  };

  const parseStatement = (): Stmt | undefined => {
    skipNewlines();
    if (isAtEnd() || check("Dedent")) {
      return undefined;
    }
    try {
      if (check("Let")) {
        const start = advance();
        const isMutable = check("Mut") ? (advance(), true) : false;
        const nameTok = consume("Identifier", "expected variable name");
        let typeAnn: TypeAnn = { kind: "None" };
        if (check("Colon")) {
          advance();
          typeAnn = parseTypeAnn();
        }
        consume("Equal", "expected '=' after variable name");
        const initializer = parseExpression();
        return {
          kind: "Let",
          span: { start: start.span.start, end: initializer.span.end, line: start.span.line },
          isMutable,
          name: nameTok.lexeme,
          typeAnn,
          initializer,
        };
      }
      if (check("At")) {
        const at = advance();
        let forKind: ForKind = "Seq";
        if (check("Identifier") && peek().lexeme === "parallel") {
          advance();
          forKind = "Parallel";
        } else if (check("Identifier") && peek().lexeme === "vectorize") {
          advance();
          forKind = "Vectorized";
        } else if (check("Identifier")) {
          errorAt(peek(), "unknown loop decorator");
          advance();
        }
        skipNewlines();
        if (check("At") && forKind === "Parallel") {
          advance();
          if (check("Identifier") && peek().lexeme === "vectorize") {
            advance();
            forKind = "ParallelVectorized";
          }
          skipNewlines();
        }
        if (!check("For")) {
          errorAt(peek(), "expected for-loop after decorator");
          synchronize();
          return undefined;
        }
        return parseFor(forKind, at.span);
      }
      if (check("If")) {
        return parseIf();
      }
      if (check("While")) {
        const start = advance();
        const condition = parseExpression();
        consume("Colon", "expected ':' after while condition");
        const body = parseBlock();
        return { kind: "While", span: { start: start.span.start, end: body.span.end, line: start.span.line }, condition, body };
      }
      if (check("For")) {
        return parseFor("Seq");
      }
      if (check("Return")) {
        const start = advance();
        let value: Expr = { kind: "Literal", span: start.span, lit: { kind: "None" } };
        if (!check("Newline") && !check("Dedent") && !check("Eof")) {
          value = parseExpression();
        }
        return { kind: "Return", span: { start: start.span.start, end: value.span.end, line: start.span.line }, value };
      }
      if (check("Break")) {
        const tok = advance();
        return { kind: "Break", span: tok.span };
      }
      if (check("Continue")) {
        const tok = advance();
        return { kind: "Continue", span: tok.span };
      }
      if (check("Raise")) {
        const start = advance();
        const value = parseExpression();
        return { kind: "Raise", span: { start: start.span.start, end: value.span.end, line: start.span.line }, value };
      }
      if (check("Import")) {
        const start = advance();
        const moduleTok = consume("Identifier", "expected module name");
        let alias: string | undefined;
        if (check("As")) {
          advance();
          alias = consume("Identifier", "expected alias after 'as'").lexeme;
        }
        return { kind: "Import", span: start.span, module: moduleTok.lexeme, alias };
      }
      if (check("From")) {
        const start = advance();
        const moduleTok = consume("Identifier", "expected module name");
        consume("Import", "expected 'import' after module name");
        const names: Array<{ name: string; alias?: string }> = [];
        do {
          const n = consume("Identifier", "expected imported name");
          let alias: string | undefined;
          if (check("As")) {
            advance();
            alias = consume("Identifier", "expected alias").lexeme;
          }
          names.push({ name: n.lexeme, alias });
        } while (check("Comma") && (advance(), true));
        return { kind: "ImportFrom", span: start.span, module: moduleTok.lexeme, names };
      }
      if (check("With")) {
        const start = advance();
        const value = parseExpression();
        consume("As", "expected 'as' in with statement");
        const varTok = consume("Identifier", "expected variable after 'as'");
        consume("Colon", "expected ':' after with header");
        const body = parseBlock();
        return {
          kind: "With",
          span: { start: start.span.start, end: body.span.end, line: start.span.line },
          value,
          varName: varTok.lexeme,
          body,
        };
      }
      if (check("Pub") || check("Fn") || check("Def")) {
        const start = peek();
        const isPub = check("Pub") ? (advance(), true) : false;
        if (!check("Fn") && !check("Def")) {
          errorAt(peek(), "expected fn or def");
          synchronize();
          return undefined;
        }
        advance();
        const decl = parseFunctionDecl(start.span, isPub);
        return { kind: "Function", span: decl.span, decl };
      }
      if (check("Trait")) {
        const start = advance();
        const nameTok = consume("Identifier", "expected trait name");
        consume("Colon", "expected ':' after trait name");
        const block = parseBlock();
        const methods: FunctionDecl[] = [];
        if (block.kind === "Block") {
          for (const s of block.stmts) {
            if (s.kind === "Function") {
              methods.push(s.decl);
            }
          }
        }
        return { kind: "Trait", span: { start: start.span.start, end: block.span.end, line: start.span.line }, name: nameTok.lexeme, methods };
      }
      if (check("Struct")) {
        const start = advance();
        const nameTok = consume("Identifier", "expected struct name");
        let implementedTrait: string | undefined;
        if (check("LeftParen")) {
          advance();
          implementedTrait = consume("Identifier", "expected trait name").lexeme;
          consume("RightParen", "expected ')' after trait name");
        }
        consume("Colon", "expected ':' after struct header");
        skipNewlines();
        const fields: StructField[] = [];
        const methods: MethodDecl[] = [];
        if (check("Indent")) {
          advance();
          while (!isAtEnd() && !check("Dedent") && !check("Eof")) {
            skipNewlines();
            if (check("Dedent") || check("Eof")) {
              break;
            }
            if (check("Let")) {
              const letTok = advance();
              let isPub = false;
              let isMut = false;
              if (check("Pub")) {
                advance();
                isPub = true;
              }
              if (check("Mut")) {
                advance();
                isMut = true;
              }
              if (check("Pub")) {
                advance();
                isPub = true;
              }
              const fieldTok = consume("Identifier", "expected field name");
              consume("Colon", "expected ':' after field name");
              const typeName = parseTypeName();
              fields.push({
                name: fieldTok.lexeme,
                typeName,
                isPub,
                isMut,
                span: { start: letTok.span.start, end: fieldTok.span.end, line: letTok.span.line },
              });
            } else if (check("Pub") || check("Fn") || check("Def")) {
              const isPub = check("Pub") ? (advance(), true) : false;
              if (check("Fn") || check("Def")) {
                const fnStart = peek();
                advance();
                methods.push({ isPub, function: parseFunctionDecl(fnStart.span, isPub) });
              }
            } else {
              errorAt(peek(), "expected field or method in struct");
              synchronize();
            }
            skipNewlines();
          }
          if (check("Dedent")) {
            advance();
          }
        }
        return {
          kind: "Struct",
          span: start.span,
          name: nameTok.lexeme,
          implementedTrait,
          fields,
          methods,
        };
      }
      if (checkAny("Identifier", "Array", "Dict") && tokens[current + 1]?.type === "Colon") {
        const start = peek();
        errorAt(start, "typed binding must start with 'let' or 'let mut'");
        const nameTok = advance();
        advance();
        const typeAnn = parseTypeAnn();
        if (check("Equal")) {
          advance();
        }
        const initializer = parseExpression();
        return {
          kind: "Let",
          span: { start: start.span.start, end: initializer.span.end, line: start.span.line },
          isMutable: false,
          name: nameTok.lexeme,
          typeAnn,
          initializer,
        };
      }
      const expr = parseExpression();
      return { kind: "Expr", span: expr.span, expr };
    } catch {
      synchronize();
      return undefined;
    }
  };

  const stmts: Stmt[] = [];
  skipNewlines();
  while (!isAtEnd()) {
    skipNewlines();
    if (isAtEnd()) {
      break;
    }
    const stmt = parseStatement();
    if (stmt) {
      stmts.push(stmt);
    } else {
      synchronize();
    }
    skipNewlines();
  }
  return { stmts, diagnostics, tokens };
}
