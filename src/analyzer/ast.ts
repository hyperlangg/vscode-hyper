export interface Span {
  start: number;
  end: number;
  line: number;
}

export const emptySpan = (line = 1): Span => ({ start: 0, end: 0, line });

export type ErrorKind = "SyntaxError" | "IndentationError";

export interface AnalyzerDiagnostic {
  kind: ErrorKind;
  message: string;
  span: Span;
}

export type BinOp =
  | "Add"
  | "Sub"
  | "Mul"
  | "Div"
  | "FloorDiv"
  | "Rem"
  | "Pow"
  | "Eq"
  | "Ne"
  | "Lt"
  | "Le"
  | "Gt"
  | "Ge"
  | "And"
  | "Or";

export type UnaryOp = "Neg" | "Not";

export type Literal =
  | { kind: "None" }
  | { kind: "Bool"; value: boolean }
  | { kind: "Number"; value: string }
  | { kind: "String"; value: string };

export type TypeAnn =
  | { kind: "None" }
  | { kind: "Named"; name: string }
  | { kind: "Array"; inner: string }
  | { kind: "Dict"; key: string; value: string };

export type CallArg =
  | { kind: "Positional"; expr: Expr }
  | { kind: "Named"; name: string; value: Expr };

export type FStringPart =
  | { kind: "Literal"; value: string }
  | { kind: "Expr"; expr: Expr };

export type Expr =
  | { kind: "Literal"; span: Span; lit: Literal }
  | { kind: "Variable"; span: Span; name: string }
  | { kind: "Group"; span: Span; inner: Expr }
  | { kind: "Unary"; span: Span; op: UnaryOp; right: Expr }
  | { kind: "Binary"; span: Span; op: BinOp; left: Expr; right: Expr }
  | { kind: "Assign"; span: Span; name: string; value: Expr }
  | { kind: "GetField"; span: Span; object: string; field: string }
  | { kind: "SetField"; span: Span; object: string; field: string; value: Expr }
  | { kind: "Call"; span: Span; callee: Expr; args: CallArg[] }
  | { kind: "CallMethod"; span: Span; object: Expr; method: string; args: Expr[] }
  | { kind: "List"; span: Span; items: Expr[] }
  | { kind: "Dict"; span: Span; entries: Array<[Expr, Expr]> }
  | { kind: "Index"; span: Span; object: Expr; index: Expr }
  | { kind: "IndexSet"; span: Span; object: Expr; index: Expr; value: Expr }
  | { kind: "FString"; span: Span; parts: FStringPart[] }
  | { kind: "Ternary"; span: Span; condition: Expr; thenBranch: Expr; elseBranch: Expr }
  | { kind: "Handle"; span: Span; attempt: Expr; fallback: Expr };

export interface Param {
  name: string;
  isRef: boolean;
  typeAnn?: string;
  span: Span;
}

export interface FunctionDecl {
  name: string;
  isStrict: boolean;
  params: Param[];
  returnType?: string;
  raises: boolean;
  body: Stmt;
  span: Span;
}

export interface StructField {
  name: string;
  typeName: string;
  isPub: boolean;
  isMut: boolean;
  span: Span;
}

export interface MethodDecl {
  isPub: boolean;
  function: FunctionDecl;
}

export type ForKind = "Seq" | "Parallel" | "Vectorized" | "ParallelVectorized";

export type ForIter =
  | { kind: "Range"; start: Expr; end: Expr }
  | { kind: "Iterable"; expr: Expr };

export interface ImportName {
  name: string;
  alias?: string;
}

export type Stmt =
  | {
      kind: "Let";
      span: Span;
      isMutable: boolean;
      name: string;
      typeAnn: TypeAnn;
      initializer: Expr;
    }
  | { kind: "Expr"; span: Span; expr: Expr }
  | { kind: "Block"; span: Span; stmts: Stmt[] }
  | {
      kind: "If";
      span: Span;
      condition: Expr;
      thenBranch: Stmt;
      elseBranch?: Stmt;
    }
  | { kind: "While"; span: Span; condition: Expr; body: Stmt }
  | {
      kind: "For";
      span: Span;
      forKind: ForKind;
      varName: string;
      iter: ForIter;
      body: Stmt;
    }
  | { kind: "Function"; span: Span; decl: FunctionDecl }
  | { kind: "Return"; span: Span; value: Expr }
  | { kind: "Break"; span: Span }
  | { kind: "Continue"; span: Span }
  | { kind: "Raise"; span: Span; value: Expr }
  | {
      kind: "Struct";
      span: Span;
      name: string;
      implementedTrait?: string;
      fields: StructField[];
      methods: MethodDecl[];
    }
  | { kind: "Trait"; span: Span; name: string; methods: FunctionDecl[] }
  | { kind: "With"; span: Span; value: Expr; varName: string; body: Stmt }
  | { kind: "Import"; span: Span; module: string; alias?: string }
  | { kind: "ImportFrom"; span: Span; module: string; names: ImportName[] };

export function exprSpan(expr: Expr): Span {
  return expr.span;
}

export function stmtSpan(stmt: Stmt): Span {
  return stmt.span;
}

export function formatBinOp(op: BinOp): string {
  const map: Record<BinOp, string> = {
    Add: "+",
    Sub: "-",
    Mul: "*",
    Div: "/",
    FloorDiv: "//",
    Rem: "%",
    Pow: "**",
    Eq: "==",
    Ne: "!=",
    Lt: "<",
    Le: "<=",
    Gt: ">",
    Ge: ">=",
    And: "and",
    Or: "or",
  };
  return map[op];
}
