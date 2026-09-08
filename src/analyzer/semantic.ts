import {
  AnalyzerDiagnostic,
  BinOp,
  CallArg,
  Expr,
  FunctionDecl,
  Span,
  Stmt,
  TypeAnn,
  exprSpan,
  formatBinOp,
  stmtSpan,
} from "./ast";
import { parse } from "./parser";

export type HyperType =
  | { kind: "None" }
  | { kind: "Bool" }
  | { kind: "String" }
  | { kind: "I8" }
  | { kind: "I16" }
  | { kind: "I32" }
  | { kind: "I64" }
  | { kind: "U8" }
  | { kind: "U16" }
  | { kind: "U32" }
  | { kind: "U64" }
  | { kind: "F32" }
  | { kind: "F64" }
  | { kind: "List"; inner: HyperType }
  | { kind: "Dict" }
  | { kind: "Array"; inner: HyperType }
  | { kind: "Function"; params: HyperType[]; ret: HyperType }
  | { kind: "Struct"; name: string }
  | { kind: "Trait"; name: string }
  | { kind: "Mmap" }
  | { kind: "File" }
  | { kind: "Any" };

export interface Binding {
  name: string;
  ty: HyperType;
  mutable: boolean;
  span: Span;
  kind: "variable" | "function" | "struct" | "trait" | "param" | "builtin";
}

export interface MethodSig {
  name: string;
  params: number;
}

export interface HoverInfo {
  span: Span;
  markdown: string;
}

export interface NameLink {
  name: string;
  use: Span;
  def: Span;
}

function tyEq(a: HyperType, b: HyperType): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "List" && b.kind === "List") {
    return tyEq(a.inner, b.inner);
  }
  if (a.kind === "Array" && b.kind === "Array") {
    return tyEq(a.inner, b.inner);
  }
  if (a.kind === "Struct" && b.kind === "Struct") {
    return a.name === b.name;
  }
  if (a.kind === "Trait" && b.kind === "Trait") {
    return a.name === b.name;
  }
  if (a.kind === "Function" && b.kind === "Function") {
    return a.params.length === b.params.length && tyEq(a.ret, b.ret) && a.params.every((p, i) => tyEq(p, b.params[i]!));
  }
  return true;
}

export function formatType(ty: HyperType): string {
  switch (ty.kind) {
    case "None":
      return "None";
    case "Bool":
      return "bool";
    case "String":
      return "string";
    case "List":
      return `list[${formatType(ty.inner)}]`;
    case "Array":
      return `Array[${formatType(ty.inner)}]`;
    case "Dict":
      return "Dict";
    case "Function":
      return `fn(${ty.params.map(formatType).join(", ")}) -> ${formatType(ty.ret)}`;
    case "Struct":
      return ty.name;
    case "Trait":
      return ty.name;
    case "Any":
      return "_";
    default:
      return ty.kind.toLowerCase();
  }
}

interface Scope {
  bindings: Map<string, Binding>;
  inferred: Set<string>;
}

class TypeChecker {
  scopes: Scope[] = [];
  errors: AnalyzerDiagnostic[] = [];
  hovers: HoverInfo[] = [];
  symbols: Binding[] = [];
  links: NameLink[] = [];
  expectedReturn: HyperType | undefined;
  structs = new Map<string, { fields: Array<{ name: string; ty: HyperType; mutable: boolean }> }>();
  traits = new Map<string, MethodSig[]>();
  loopDepth = 0;
  handleDepth = 0;
  allowsRaise = false;

  constructor() {
    this.pushScope();
    const fn = (params: HyperType[], ret: HyperType): HyperType => ({ kind: "Function", params, ret });
    const any1 = (ret: HyperType): HyperType => fn([{ kind: "Any" }], ret);
    const any2 = (ret: HyperType): HyperType => fn([{ kind: "Any" }, { kind: "Any" }], ret);
    const builtin = (name: string, ty: HyperType): void => {
      this.define({ name, ty, mutable: false, span: { start: 0, end: 0, line: 1 }, kind: "builtin" });
    };
    builtin("print", any1({ kind: "None" }));
    builtin("input", any1({ kind: "String" }));
    builtin("clock", fn([], { kind: "F64" }));
    builtin("open", any1({ kind: "File" }));
    builtin("len", any1({ kind: "I64" }));
    builtin("abs", any1({ kind: "Any" }));
    builtin("min", any1({ kind: "Any" }));
    builtin("max", any1({ kind: "Any" }));
    builtin("sum", any1({ kind: "Any" }));
    builtin("round", any1({ kind: "Any" }));
    builtin("pow", any2({ kind: "Any" }));
    builtin("divmod", any2({ kind: "List", inner: { kind: "Any" } }));
    builtin("chr", any1({ kind: "String" }));
    builtin("ord", any1({ kind: "I64" }));
    builtin("bin", any1({ kind: "String" }));
    builtin("hex", any1({ kind: "String" }));
    builtin("oct", any1({ kind: "String" }));
    builtin("int", any1({ kind: "I64" }));
    builtin("float", any1({ kind: "F64" }));
    builtin("str", any1({ kind: "String" }));
    builtin("bool", any1({ kind: "Bool" }));
    builtin("all", any1({ kind: "Bool" }));
    builtin("any", any1({ kind: "Bool" }));
    builtin("sorted", any1({ kind: "List", inner: { kind: "Any" } }));
    builtin("reversed", any1({ kind: "List", inner: { kind: "Any" } }));
    builtin("enumerate", any1({ kind: "List", inner: { kind: "Any" } }));
    builtin("zip", any1({ kind: "List", inner: { kind: "Any" } }));
    builtin("list", any1({ kind: "List", inner: { kind: "Any" } }));
    builtin("range", any1({ kind: "List", inner: { kind: "I64" } }));
    builtin("repr", any1({ kind: "String" }));
  }

  pushScope(): void {
    this.scopes.push({ bindings: new Map(), inferred: new Set() });
  }

  popScope(): void {
    this.scopes.pop();
  }

  define(binding: Binding): void {
    const scope = this.scopes[this.scopes.length - 1];
    scope?.bindings.set(binding.name, binding);
    if (binding.kind !== "builtin") {
      this.symbols.push(binding);
    }
  }

  lookup(name: string): Binding | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i -= 1) {
      const found = this.scopes[i]?.bindings.get(name);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  syntaxError(span: Span, message: string): void {
    this.errors.push({ kind: "SyntaxError", message, span });
  }

  error(span: Span, message: string): void {
    this.syntaxError(span, message);
  }

  hover(span: Span, markdown: string): void {
    this.hovers.push({ span, markdown });
  }

  use(span: Span, binding: Binding): void {
    if (binding.kind === "builtin") {
      return;
    }
    this.links.push({ name: binding.name, use: span, def: binding.span });
  }

  resolveTypeName(name: string): HyperType {
    const array = name.match(/^Array\[(.+)\]$/i);
    if (array) {
      return { kind: "Array", inner: this.resolveTypeName(array[1]!.trim()) };
    }
    const dict = name.match(/^Dict\[(.+)\]$/i);
    if (dict) {
      return { kind: "Dict" };
    }
    const aliases: Record<string, string> = {
      int8: "i8",
      int16: "i16",
      int32: "i32",
      int64: "i64",
      uint8: "u8",
      uint16: "u16",
      uint32: "u32",
      uint64: "u64",
      float32: "f32",
      float64: "f64",
      boolean: "bool",
    };
    const ty = aliases[name] ?? name;
    switch (ty) {
      case "None":
      case "none":
        return { kind: "None" };
      case "bool":
        return { kind: "Bool" };
      case "string":
      case "str":
        return { kind: "String" };
      case "i8":
        return { kind: "I8" };
      case "i16":
        return { kind: "I16" };
      case "i32":
        return { kind: "I32" };
      case "i64":
        return { kind: "I64" };
      case "u8":
        return { kind: "U8" };
      case "u16":
        return { kind: "U16" };
      case "u32":
        return { kind: "U32" };
      case "u64":
        return { kind: "U64" };
      case "f32":
        return { kind: "F32" };
      case "f64":
        return { kind: "F64" };
      case "any":
      case "Any":
        return { kind: "Any" };
      case "list":
      case "List":
        return { kind: "List", inner: { kind: "Any" } };
      case "dict":
      case "Dict":
        return { kind: "Dict" };
      case "mmap":
      case "Mmap":
        return { kind: "Mmap" };
      case "file":
      case "File":
        return { kind: "File" };
      default:
        if (this.structs.has(ty)) {
          return { kind: "Struct", name: ty };
        }
        if (this.traits.has(ty)) {
          return { kind: "Trait", name: ty };
        }
        return { kind: "Any" };
    }
  }

  typeAnnToHyper(ann: TypeAnn): HyperType {
    switch (ann.kind) {
      case "None":
        return { kind: "Any" };
      case "Named":
        return this.resolveTypeName(ann.name);
      case "Array":
        return { kind: "Array", inner: this.resolveTypeName(ann.inner) };
      case "Dict":
        return { kind: "Dict" };
    }
  }

  static isNumeric(ty: HyperType): boolean {
    return (
      ty.kind === "I8" ||
      ty.kind === "I16" ||
      ty.kind === "I32" ||
      ty.kind === "I64" ||
      ty.kind === "U8" ||
      ty.kind === "U16" ||
      ty.kind === "U32" ||
      ty.kind === "U64" ||
      ty.kind === "F32" ||
      ty.kind === "F64" ||
      ty.kind === "Any"
    );
  }

  static isBoolish(ty: HyperType): boolean {
    return ty.kind === "Bool" || ty.kind === "Any" || ty.kind === "None" || TypeChecker.isNumeric(ty) || ty.kind === "String";
  }

  static numericRank(ty: HyperType): number | undefined {
    switch (ty.kind) {
      case "I8":
      case "U8":
        return 1;
      case "I16":
      case "U16":
        return 2;
      case "I32":
      case "U32":
        return 3;
      case "I64":
      case "U64":
        return 4;
      case "F32":
        return 5;
      case "F64":
        return 6;
      case "Any":
        return 0;
      default:
        return undefined;
    }
  }

  static widenNumeric(a: HyperType, b: HyperType): HyperType {
    if (a.kind === "Any") {
      return b;
    }
    if (b.kind === "Any") {
      return a;
    }
    const ra = TypeChecker.numericRank(a) ?? 0;
    const rb = TypeChecker.numericRank(b) ?? 0;
    return ra >= rb ? a : b;
  }

  static isCompatible(dest: HyperType, src: HyperType): boolean {
    if (dest.kind === "Any" || src.kind === "Any") {
      return true;
    }
    if (tyEq(dest, src)) {
      return true;
    }
    const rd = TypeChecker.numericRank(dest);
    const rs = TypeChecker.numericRank(src);
    if (rd !== undefined && rs !== undefined) {
      return rs <= rd;
    }
    if (dest.kind === "F32" && src.kind === "F64") {
      return true;
    }
    if (dest.kind === "List" && src.kind === "List") {
      return dest.inner.kind === "Any" || TypeChecker.isCompatible(dest.inner, src.inner);
    }
    if (dest.kind === "Array" && src.kind === "Array") {
      return dest.inner.kind === "Any" || TypeChecker.isCompatible(dest.inner, src.inner);
    }
    if (dest.kind === "Array" && src.kind === "List") {
      return dest.inner.kind === "Any" || TypeChecker.isCompatible(dest.inner, src.inner);
    }
    if (dest.kind === "Dict" && src.kind === "Dict") {
      return true;
    }
    return false;
  }

  inferLit(lit: { kind: string; value?: string | boolean }): HyperType {
    if (lit.kind === "None") {
      return { kind: "None" };
    }
    if (lit.kind === "Bool") {
      return { kind: "Bool" };
    }
    if (lit.kind === "String") {
      return { kind: "String" };
    }
    const cleaned = String(lit.value ?? "").replace(/_/g, "");
    if (cleaned.includes(".") || /[eE]/.test(cleaned)) {
      return { kind: "F64" };
    }
    const asI32 = Number.parseInt(cleaned, 10);
    if (Number.isFinite(asI32) && asI32 >= -2147483648 && asI32 <= 2147483647 && !cleaned.includes(".")) {
      try {
        if (BigInt(cleaned) <= 2147483647n && BigInt(cleaned) >= -2147483648n) {
          return { kind: "I32" };
        }
      } catch {
        return { kind: "F64" };
      }
    }
    try {
      const n = BigInt(cleaned);
      if (n >= -9223372036854775808n && n <= 9223372036854775807n) {
        return { kind: "I64" };
      }
      return { kind: "U64" };
    } catch {
      return { kind: "F64" };
    }
  }

  isZeroLiteral(expr: Expr): boolean {
    if (expr.kind === "Literal" && expr.lit.kind === "Number") {
      const t = expr.lit.value.trim().replace(/_/g, "");
      return Number(t) === 0;
    }
    if (expr.kind === "Group") {
      return this.isZeroLiteral(expr.inner);
    }
    if (expr.kind === "Unary" && expr.op === "Neg") {
      return this.isZeroLiteral(expr.right);
    }
    return false;
  }

  checkBinary(span: Span, op: BinOp, left: HyperType, right: HyperType): HyperType {
    switch (op) {
      case "Add":
        if (left.kind === "String" && right.kind === "String") {
          return { kind: "String" };
        }
        if ((left.kind === "String" || right.kind === "String") && (left.kind === "Any" || right.kind === "Any")) {
          return { kind: "String" };
        }
        if (TypeChecker.isNumeric(left) && TypeChecker.isNumeric(right)) {
          return TypeChecker.widenNumeric(left, right);
        }
        if (left.kind === "Any" || right.kind === "Any") {
          return { kind: "Any" };
        }
        this.error(span, `Type error: '+' requires numeric or string operands, got ${formatType(left)} and ${formatType(right)}.`);
        return { kind: "Any" };
      case "Sub":
      case "Mul":
      case "Div":
      case "FloorDiv":
      case "Rem":
      case "Pow":
        if (TypeChecker.isNumeric(left) && TypeChecker.isNumeric(right)) {
          return TypeChecker.widenNumeric(left, right);
        }
        this.error(
          span,
          `Type error: arithmetic '${formatBinOp(op)}' requires numeric operands, got ${formatType(left)} and ${formatType(right)}.`,
        );
        return { kind: "Any" };
      case "Eq":
      case "Ne":
        return { kind: "Bool" };
      case "Lt":
      case "Le":
      case "Gt":
      case "Ge": {
        const ok =
          (TypeChecker.isNumeric(left) && TypeChecker.isNumeric(right)) ||
          (left.kind === "Bool" && right.kind === "Bool") ||
          (left.kind === "String" && right.kind === "String") ||
          left.kind === "Any" ||
          right.kind === "Any";
        if (!ok) {
          this.error(
            span,
            `Type error: comparison requires numeric, bool, or string operands, got ${formatType(left)} and ${formatType(right)}.`,
          );
        }
        return { kind: "Bool" };
      }
      case "And":
      case "Or":
        if (!TypeChecker.isBoolish(left) || !TypeChecker.isBoolish(right)) {
          this.error(span, `Type error: '${formatBinOp(op)}' requires bool-ish operands, got ${formatType(left)} and ${formatType(right)}.`);
        }
        return { kind: "Bool" };
    }
  }

  checkBuiltinCall(span: Span, name: string, args: CallArg[], argTys: HyperType[]): HyperType | undefined {
    const n = argTys.length;
    const expectExact = (want: number): void => {
      if (n !== want) {
        this.error(span, `Type error: ${name} expects ${want} argument(s) but got ${n}.`);
      }
    };
    switch (name) {
      case "print":
        return undefined;
      case "clock":
        expectExact(0);
        return { kind: "F64" };
      case "input":
        if (n > 1) {
          this.error(span, `Type error: input expects 0 or 1 argument(s) but got ${n}.`);
        }
        return { kind: "String" };
      case "open":
        if (n === 0 || n > 2) {
          this.error(span, `Type error: open expects 1 or 2 argument(s) but got ${n}.`);
        }
        return { kind: "File" };
      case "len":
        expectExact(1);
        if (n === 1) {
          const t = argTys[0]!;
          const ok = t.kind === "List" || t.kind === "Array" || t.kind === "Dict" || t.kind === "String" || t.kind === "Any";
          if (!ok) {
            this.error(span, `Type error: len() argument must be a list, array, dict, or string, got ${formatType(t)}.`);
          }
        }
        return { kind: "I64" };
      case "range":
        if (n === 0 || n > 3) {
          this.error(span, `Type error: range expects 1 to 3 argument(s) but got ${n}.`);
        }
        return { kind: "List", inner: { kind: "I64" } };
      case "abs":
        expectExact(1);
        if (n === 1 && !TypeChecker.isNumeric(argTys[0]!) && argTys[0]!.kind !== "Any") {
          this.error(span, `Type error: abs() expects a number, got ${formatType(argTys[0]!)}.`);
        }
        return { kind: "Any" };
      default:
        return undefined;
    }
  }

  checkMethod(span: Span, receiver: HyperType, method: string, argc: number): HyperType {
    const stringMethods = new Set([
      "len",
      "upper",
      "lower",
      "strip",
      "split",
      "replace",
      "find",
      "startswith",
      "endswith",
      "join",
      "read",
    ]);
    if (receiver.kind === "Any" || receiver.kind === "Struct" || receiver.kind === "File" || receiver.kind === "Mmap") {
      return { kind: "Any" };
    }
    if (receiver.kind === "String") {
      if (!stringMethods.has(method)) {
        this.error(span, `Type error: string has no method '${method}'.`);
      }
      if (method === "len" || method === "find") {
        return { kind: "I64" };
      }
      if (method === "startswith" || method === "endswith") {
        return { kind: "Bool" };
      }
      if (method === "split") {
        return { kind: "List", inner: { kind: "String" } };
      }
      return { kind: "String" };
    }
    if (receiver.kind === "List" || receiver.kind === "Array") {
      if (method === "len") {
        if (argc !== 0) {
          this.error(span, `Type error: 'len' expects 0 argument(s) but got ${argc}.`);
        }
        return { kind: "I64" };
      }
      if (method === "append") {
        if (argc !== 1) {
          this.error(span, `Type error: 'append' expects 1 argument(s) but got ${argc}.`);
        }
        return { kind: "None" };
      }
      this.error(span, `Type error: list has no method '${method}'.`);
      return { kind: "Any" };
    }
    if (receiver.kind === "Dict") {
      if (method === "len") {
        return { kind: "I64" };
      }
      if (method === "keys") {
        return { kind: "List", inner: { kind: "String" } };
      }
      this.error(span, `Type error: dict has no method '${method}'.`);
      return { kind: "Any" };
    }
    this.error(span, `Type error: type ${formatType(receiver)} has no method '${method}'.`);
    return { kind: "Any" };
  }

  checkExpr(expr: Expr): HyperType {
    const span = exprSpan(expr);
    switch (expr.kind) {
      case "Literal": {
        const ty = this.inferLit(expr.lit);
        this.hover(span, `\`\`\`hyper\n${formatType(ty)}\n\`\`\``);
        return ty;
      }
      case "Variable": {
        const b = this.lookup(expr.name);
        if (b) {
          this.use(span, b);
          let line: string;
          if (b.kind === "function" || b.kind === "builtin") {
            line = `${b.name}: ${formatType(b.ty)}`;
          } else if (b.kind === "struct") {
            line = `struct ${b.name}`;
          } else if (b.kind === "trait") {
            line = `trait ${b.name}`;
          } else {
            line = `${b.mutable ? "let mut " : "let "}${b.name}: ${formatType(b.ty)}`;
          }
          this.hover(span, `\`\`\`hyper\n${line}\n\`\`\``);
          return b.ty;
        }
        if (this.structs.has(expr.name)) {
          return { kind: "Struct", name: expr.name };
        }
        this.syntaxError(span, `undefined variable '${expr.name}'`);
        return { kind: "Any" };
      }
      case "Group":
        return this.checkExpr(expr.inner);
      case "Unary": {
        const rt = this.checkExpr(expr.right);
        if (expr.op === "Neg") {
          if (!TypeChecker.isNumeric(rt)) {
            this.error(span, `Type error: unary '-' requires a numeric operand, got ${formatType(rt)}.`);
          }
          return rt;
        }
        return { kind: "Bool" };
      }
      case "Binary": {
        const lt = this.checkExpr(expr.left);
        const rt = this.checkExpr(expr.right);
        if ((expr.op === "Div" || expr.op === "FloorDiv" || expr.op === "Rem") && this.isZeroLiteral(expr.right)) {
          this.error(span, `Type error: division by zero in '${formatBinOp(expr.op)}'.`);
        }
        return this.checkBinary(span, expr.op, lt, rt);
      }
      case "Assign": {
        const vt = this.checkExpr(expr.value);
        const b = this.lookup(expr.name);
        if (!b) {
          this.error(span, `Error: Undefined variable '${expr.name}'.`);
          return { kind: "Any" };
        }
        this.use(expr.nameSpan, b);
        if (!b.mutable) {
          this.error(span, `Error: Cannot reassign immutable variable '${expr.name}'. Use 'let mut' to make it mutable.`);
        } else if (!TypeChecker.isCompatible(b.ty, vt) && b.ty.kind !== "Any" && vt.kind !== "Any") {
          this.error(span, `Type error: cannot assign ${formatType(vt)} to '${expr.name}' of type ${formatType(b.ty)}.`);
        }
        return b.ty;
      }
      case "GetField": {
        const obj = this.lookup(expr.object);
        if (!obj && !this.structs.has(expr.object)) {
          this.error(span, `Error: Undefined variable '${expr.object}'.`);
        }
        if (obj) {
          this.use({ start: span.start, end: span.start + expr.object.length, line: span.line }, obj);
        }
        if (obj?.ty.kind === "Struct") {
          const st = this.structs.get(obj.ty.name);
          const field = st?.fields.find((f) => f.name === expr.field);
          if (field) {
            this.hover(span, `\`\`\`hyper\n${expr.object}.${expr.field}: ${formatType(field.ty)}\n\`\`\``);
            return field.ty;
          }
        }
        return { kind: "Any" };
      }
      case "SetField": {
        if (!this.lookup(expr.object)) {
          this.error(span, `Error: Undefined variable '${expr.object}'.`);
        }
        this.checkExpr(expr.value);
        return { kind: "Any" };
      }
      case "Call": {
        const calleeTy = this.checkExpr(expr.callee);
        const argTys = expr.args.map((a) => this.checkExpr(a.kind === "Positional" ? a.expr : a.value));
        if (expr.callee.kind === "Variable") {
          const builtin = this.checkBuiltinCall(span, expr.callee.name, expr.args, argTys);
          if (builtin) {
            return builtin;
          }
        }
        if (calleeTy.kind === "Struct") {
          return calleeTy;
        }
        if (calleeTy.kind === "Function") {
          const allAny = calleeTy.params.every((p) => p.kind === "Any") && calleeTy.params.length <= 1;
          if (!allAny && calleeTy.params.length !== argTys.length) {
            this.error(span, `Type error: expected ${calleeTy.params.length} argument(s) but got ${argTys.length}.`);
          } else if (!allAny) {
            calleeTy.params.forEach((pt, i) => {
              const at = argTys[i];
              if (at && !TypeChecker.isCompatible(pt, at)) {
                this.error(span, `Type error: argument ${i + 1} expected ${formatType(pt)}, got ${formatType(at)}.`);
              }
            });
          }
          return calleeTy.ret;
        }
        if (calleeTy.kind === "Any") {
          return { kind: "Any" };
        }
        this.error(span, `Type error: value of type ${formatType(calleeTy)} is not callable.`);
        return { kind: "Any" };
      }
      case "CallMethod": {
        const ot = this.checkExpr(expr.object);
        expr.args.forEach((a) => this.checkExpr(a));
        return this.checkMethod(span, ot, expr.method, expr.args.length);
      }
      case "List": {
        let elem: HyperType = { kind: "Any" };
        expr.items.forEach((item, i) => {
          const t = this.checkExpr(item);
          if (i === 0) {
            elem = t;
          } else if (TypeChecker.isNumeric(elem) && TypeChecker.isNumeric(t)) {
            elem = TypeChecker.widenNumeric(elem, t);
          } else if (!TypeChecker.isCompatible(elem, t) && !TypeChecker.isCompatible(t, elem)) {
            elem = { kind: "Any" };
          }
        });
        return { kind: "List", inner: elem };
      }
      case "Dict":
        expr.entries.forEach(([k, v]) => {
          this.checkExpr(k);
          this.checkExpr(v);
        });
        return { kind: "Dict" };
      case "Index": {
        const ot = this.checkExpr(expr.object);
        this.checkExpr(expr.index);
        if (ot.kind === "List" || ot.kind === "Array") {
          return ot.inner;
        }
        if (ot.kind === "Dict") {
          return { kind: "Any" };
        }
        if (ot.kind === "String") {
          return { kind: "String" };
        }
        if (ot.kind === "Any") {
          return { kind: "Any" };
        }
        this.error(span, `Type error: cannot index value of type ${formatType(ot)}.`);
        return { kind: "Any" };
      }
      case "IndexSet": {
        const ot = this.checkExpr(expr.object);
        this.checkExpr(expr.index);
        const vt = this.checkExpr(expr.value);
        if (ot.kind !== "List" && ot.kind !== "Array" && ot.kind !== "Dict" && ot.kind !== "Any") {
          this.error(span, `Type error: cannot index-assign value of type ${formatType(ot)}.`);
        }
        return vt;
      }
      case "FString":
        expr.parts.forEach((p) => {
          if (p.kind === "Expr") {
            this.checkExpr(p.expr);
          }
        });
        return { kind: "String" };
      case "Ternary": {
        this.checkExpr(expr.condition);
        const tt = this.checkExpr(expr.thenBranch);
        const et = this.checkExpr(expr.elseBranch);
        if (TypeChecker.isNumeric(tt) && TypeChecker.isNumeric(et)) {
          return TypeChecker.widenNumeric(tt, et);
        }
        return TypeChecker.isCompatible(tt, et) ? tt : { kind: "Any" };
      }
      case "Handle": {
        this.handleDepth += 1;
        const at = this.checkExpr(expr.attempt);
        this.handleDepth -= 1;
        const ft = this.checkExpr(expr.fallback);
        if (TypeChecker.isNumeric(at) && TypeChecker.isNumeric(ft)) {
          return TypeChecker.widenNumeric(at, ft);
        }
        return TypeChecker.isCompatible(at, ft) ? at : { kind: "Any" };
      }
    }
  }

  declareFunction(decl: FunctionDecl): void {
    const params = decl.params.map((p) => (p.typeAnn ? this.resolveTypeName(p.typeAnn) : ({ kind: "Any" } as HyperType)));
    const ret = decl.returnType ? this.resolveTypeName(decl.returnType) : ({ kind: "Any" } as HyperType);
    this.define({
      name: decl.name,
      ty: { kind: "Function", params, ret },
      mutable: false,
      span: decl.nameSpan,
      kind: "function",
    });
  }

  hoistFunctions(stmts: Stmt[]): void {
    for (const stmt of stmts) {
      if (stmt.kind === "Function") {
        this.declareFunction(stmt.decl);
      }
    }
  }

  checkFunction(decl: FunctionDecl, selfType?: HyperType): void {
    const params = decl.params.map((p) => (p.typeAnn ? this.resolveTypeName(p.typeAnn) : ({ kind: "Any" } as HyperType)));
    const ret = decl.returnType ? this.resolveTypeName(decl.returnType) : ({ kind: "Any" } as HyperType);
    const existing = this.scopes[this.scopes.length - 1]?.bindings.get(decl.name);
    if (!existing || existing.span.start !== decl.nameSpan.start) {
      this.define({
        name: decl.name,
        ty: { kind: "Function", params: params.slice(), ret },
        mutable: false,
        span: decl.nameSpan,
        kind: "function",
      });
    }
    this.hover(
      decl.nameSpan,
      `\`\`\`hyper\nfn ${decl.name}(${decl.params.map((p) => p.name).join(", ")})${decl.raises ? " raises" : ""} -> ${formatType(ret)}\n\`\`\``,
    );
    this.pushScope();
    decl.params.forEach((param, i) => {
      let ty = params[i] ?? { kind: "Any" };
      if (selfType && param.name === "self") {
        ty = selfType;
      }
      this.define({
        name: param.name,
        ty,
        mutable: true,
        span: param.span,
        kind: "param",
      });
    });
    if (selfType && !decl.params.some((p) => p.name === "self")) {
      this.define({ name: "self", ty: selfType, mutable: true, span: decl.nameSpan, kind: "param" });
    }
    const prevRet = this.expectedReturn;
    this.expectedReturn = ret;
    const prevLoop = this.loopDepth;
    this.loopDepth = 0;
    const prevRaise = this.allowsRaise;
    this.allowsRaise = decl.raises;
    this.checkStmt(decl.body);
    this.allowsRaise = prevRaise;
    this.loopDepth = prevLoop;
    this.expectedReturn = prevRet;
    this.popScope();
  }

  checkStmt(stmt: Stmt): void {
    const span = stmtSpan(stmt);
    switch (stmt.kind) {
      case "Let": {
        const initTy = this.checkExpr(stmt.initializer);
        let declared: HyperType;
        if (stmt.typeAnn.kind === "None") {
          declared = initTy;
        } else {
          const ann = this.typeAnnToHyper(stmt.typeAnn);
          if (!TypeChecker.isCompatible(ann, initTy)) {
            this.syntaxError(span, `cannot initialize '${stmt.name}' of type ${formatType(ann)} with ${formatType(initTy)}`);
          }
          declared = ann.kind === "Any" ? initTy : ann;
        }
        const binding: Binding = {
          name: stmt.name,
          ty: declared,
          mutable: stmt.isMutable,
          span: stmt.nameSpan,
          kind: "variable",
        };
        this.define(binding);
        if (stmt.typeAnn.kind === "None") {
          this.scopes[this.scopes.length - 1]?.inferred.add(stmt.name);
        }
        this.hover(stmt.nameSpan, `\`\`\`hyper\nlet ${stmt.isMutable ? "mut " : ""}${stmt.name}: ${formatType(declared)}\n\`\`\``);
        return;
      }
      case "Expr":
        this.checkExpr(stmt.expr);
        return;
      case "Block":
        this.pushScope();
        this.hoistFunctions(stmt.stmts);
        stmt.stmts.forEach((s) => this.checkStmt(s));
        this.popScope();
        return;
      case "If":
        this.checkExpr(stmt.condition);
        this.checkStmt(stmt.thenBranch);
        if (stmt.elseBranch) {
          this.checkStmt(stmt.elseBranch);
        }
        return;
      case "While":
        this.checkExpr(stmt.condition);
        this.loopDepth += 1;
        this.checkStmt(stmt.body);
        this.loopDepth -= 1;
        return;
      case "For": {
        let elemTy: HyperType = { kind: "I64" };
        if (stmt.iter.kind === "Range") {
          const st = this.checkExpr(stmt.iter.start);
          const et = this.checkExpr(stmt.iter.end);
          if (!TypeChecker.isNumeric(st)) {
            this.error(span, `Type error: for-loop start must be numeric, got ${formatType(st)}.`);
          }
          if (!TypeChecker.isNumeric(et)) {
            this.error(span, `Type error: for-loop end must be numeric, got ${formatType(et)}.`);
          }
          elemTy = { kind: "I64" };
        } else {
          const it = this.checkExpr(stmt.iter.expr);
          if (it.kind === "List" || it.kind === "Array") {
            elemTy = it.inner;
          } else if (it.kind !== "Any") {
            this.error(span, `Type error: for-in iterable must be a list, got ${formatType(it)}.`);
            elemTy = { kind: "Any" };
          } else {
            elemTy = { kind: "Any" };
          }
        }
        this.pushScope();
        this.define({ name: stmt.varName, ty: elemTy, mutable: false, span: stmt.varSpan, kind: "variable" });
        this.loopDepth += 1;
        this.checkStmt(stmt.body);
        this.loopDepth -= 1;
        this.popScope();
        return;
      }
      case "Function":
        this.checkFunction(stmt.decl);
        return;
      case "Return": {
        const vt = this.checkExpr(stmt.value);
        if (
          this.expectedReturn &&
          !TypeChecker.isCompatible(this.expectedReturn, vt) &&
          this.expectedReturn.kind !== "Any" &&
          vt.kind !== "Any" &&
          vt.kind !== "None"
        ) {
          this.syntaxError(span, `return type ${formatType(vt)} is not compatible with ${formatType(this.expectedReturn)}`);
        }
        return;
      }
      case "Break":
        if (this.loopDepth === 0) {
          this.syntaxError(span, "break outside loop");
        }
        return;
      case "Continue":
        if (this.loopDepth === 0) {
          this.syntaxError(span, "continue outside loop");
        }
        return;
      case "Raise":
        this.checkExpr(stmt.value);
        if (this.expectedReturn && !this.allowsRaise && this.handleDepth === 0) {
          this.syntaxError(span, "raise outside a `raises` function or `handle` expression");
        }
        return;
      case "Struct": {
        if (stmt.implementedTrait) {
          const required = this.traits.get(stmt.implementedTrait);
          if (!required) {
            this.error(span, `trait '${stmt.implementedTrait}' is not defined`);
          } else {
            for (const method of required) {
              const found = stmt.methods.find((m) => m.function.name === method.name);
              if (!found) {
                this.error(
                  span,
                  `struct '${stmt.name}' does not implement method '${method.name}' required by trait '${stmt.implementedTrait}'`,
                );
              } else if (method.params > 0 && found.function.params.length > 0 && method.params !== found.function.params.length) {
                this.error(
                  span,
                  `method '${method.name}' on struct '${stmt.name}' takes ${found.function.params.length} parameter(s) but trait '${stmt.implementedTrait}' declares ${method.params}`,
                );
              }
            }
          }
        }
        const fields = stmt.fields.map((f) => ({
          name: f.name,
          ty: this.resolveTypeName(f.typeName),
          mutable: f.isMut,
        }));
        this.structs.set(stmt.name, { fields });
        this.define({ name: stmt.name, ty: { kind: "Struct", name: stmt.name }, mutable: false, span: stmt.nameSpan, kind: "struct" });
        const selfTy: HyperType = { kind: "Struct", name: stmt.name };
        stmt.methods.forEach((m) => this.checkFunction(m.function, selfTy));
        return;
      }
      case "Trait":
        this.traits.set(
          stmt.name,
          stmt.methods.map((m) => ({ name: m.name, params: m.params.length })),
        );
        this.define({ name: stmt.name, ty: { kind: "Trait", name: stmt.name }, mutable: false, span: stmt.nameSpan, kind: "trait" });
        return;
      case "With": {
        const ty = this.checkExpr(stmt.value);
        this.pushScope();
        this.define({ name: stmt.varName, ty, mutable: false, span, kind: "variable" });
        this.checkStmt(stmt.body);
        this.popScope();
        return;
      }
      case "Import":
        this.define({
          name: stmt.alias ?? stmt.module,
          ty: { kind: "Any" },
          mutable: false,
          span,
          kind: "variable",
        });
        return;
      case "ImportFrom":
        stmt.names.forEach((n) => {
          this.define({
            name: n.alias ?? n.name,
            ty: { kind: "Any" },
            mutable: false,
            span,
            kind: "variable",
          });
        });
    }
  }

  checkProgram(stmts: Stmt[]): void {
    this.hoistFunctions(stmts);
    stmts.forEach((s) => this.checkStmt(s));
  }
}

export interface Analysis {
  diagnostics: AnalyzerDiagnostic[];
  hovers: HoverInfo[];
  symbols: Binding[];
  links: NameLink[];
  tokens: ReturnType<typeof parse>["tokens"];
}

export function analyze(source: string): Analysis {
  const parsed = parse(source);
  const checker = new TypeChecker();
  checker.checkProgram(parsed.stmts);
  return {
    diagnostics: [...parsed.diagnostics, ...checker.errors],
    hovers: checker.hovers,
    symbols: checker.symbols,
    links: checker.links,
    tokens: parsed.tokens,
  };
}
