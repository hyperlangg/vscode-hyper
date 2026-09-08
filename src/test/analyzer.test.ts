import * as fs from "fs";
import * as path from "path";
import { Position } from "vscode-languageserver/node";
import { analyze } from "../analyzer/semantic";
import { definitionLocation, documentSymbols, referenceLocations } from "../analyzer/query";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function assert(cond: boolean, message: string): void {
  if (!cond) {
    fail(message);
  }
}

function positionAt(source: string, offset: number): Position {
  let line = 0;
  let character = 0;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === "\n") {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return { line, character };
}

{
  const r = analyze("let x = 1\nx = 2\n");
  assert(
    r.diagnostics.some((d) => d.message.includes("immutable")),
    "expected immutable reassignment error",
  );
}

{
  const r = analyze("fn f(n: i64) -> i64:\n    raise 1\n    return n\n");
  assert(
    r.diagnostics.some((d) => d.message.includes("raises")),
    "expected raise-without-raises error",
  );
}

{
  const r = analyze("fn f(n: i64) raises -> i64:\n    raise 1\n    return n\n");
  assert(r.diagnostics.length === 0, `unexpected errors: ${r.diagnostics.map((d) => d.message).join("; ")}`);
}

{
  const r = analyze("break\n");
  assert(
    r.diagnostics.some((d) => d.message.includes("break outside loop")),
    "expected break outside loop",
  );
}

{
  const r = analyze("print(1 / 0)\n");
  assert(
    r.diagnostics.some((d) => d.message.toLowerCase().includes("division by zero")),
    "expected division by zero",
  );
}

{
  const r = analyze("print(missing)\n");
  assert(
    r.diagnostics.some((d) => d.message.includes("undefined variable")),
    "expected undefined variable",
  );
}

{
  const r = analyze("x: i64 = 1\n");
  assert(
    r.diagnostics.some((d) => d.message.includes("typed binding must start with 'let'")),
    "expected typed binding without let",
  );
}

{
  const src = "let mut total: i64 = 0\ntotal = total + 1\nprint(total)\n";
  const r = analyze(src);
  assert(r.diagnostics.length === 0, `clean program had errors: ${r.diagnostics.map((d) => d.message).join("; ")}`);
  const useOffset = src.indexOf("total", src.indexOf("print"));
  const loc = definitionLocation("file:///t.hyp", r, useOffset, (o) => positionAt(src, o));
  assert(!!loc, "expected go-to-definition for total");
  const refs = referenceLocations("file:///t.hyp", r, useOffset, (o) => positionAt(src, o));
  assert(refs.length >= 3, `expected references for total, got ${refs.length}`);
}

{
  const r = analyze('fn greet(who: string) -> string:\n    return f"hi {who}"\n');
  assert(r.diagnostics.length === 0, `f-string errors: ${r.diagnostics.map((d) => d.message).join("; ")}`);
}

{
  const src = "fn f(n: i64) raises -> i64:\r\n    raise 1\r\n\r\n    return n\r\n";
  const r = analyze(src);
  assert(r.diagnostics.length === 0, `CRLF blank line errors: ${r.diagnostics.map((d) => d.message).join("; ")}`);
}

{
  const src = [
    "trait Drawable:",
    "    fn draw(self)",
    "",
    "struct Point(Drawable):",
    "    let x: i32",
    "    fn draw(self):",
    "        print(self.x)",
    "",
  ].join("\n");
  const r = analyze(src);
  assert(r.diagnostics.length === 0, `struct/trait errors: ${r.diagnostics.map((d) => d.message).join("; ")}`);
  const symbols = documentSymbols("file:///t.hyp", r, (o) => positionAt(src, o));
  assert(
    symbols.some((s) => s.name === "Drawable") && symbols.some((s) => s.name === "Point") && symbols.some((s) => s.name === "draw"),
    `expected outline symbols, got ${symbols.map((s) => s.name).join(", ")}`,
  );
}

{
  const src = ["trait Drawable:", "    fn draw(self)", "", "struct Point(Drawable):", "    let x: i32", ""].join("\n");
  const r = analyze(src);
  assert(
    r.diagnostics.some((d) => d.message.includes("does not implement method 'draw'")),
    "expected missing trait method",
  );
}

{
  const helloPath = path.join(__dirname, "..", "..", "examples", "hello.hyp");
  const src = fs.readFileSync(helloPath, "utf8");
  const r = analyze(src);
  assert(r.diagnostics.length === 0, `hello.hyp errors: ${r.diagnostics.map((d) => d.message).join("; ")}`);
  const addUse = src.indexOf("add", src.indexOf("print"));
  const loc = definitionLocation("file:///hello.hyp", r, addUse, (o) => positionAt(src, o));
  assert(!!loc, "expected go-to-definition for add");
}

console.log("analyzer tests ok");
