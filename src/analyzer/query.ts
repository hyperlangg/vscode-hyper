import { Location, Position, Range, SymbolInformation, SymbolKind } from "vscode-languageserver/node";
import { Span, spanContains } from "./ast";
import { Analysis, Binding } from "./semantic";

export function rangeFromSpan(span: Span, positionAt: (offset: number) => Position): Range {
  const end = span.end > span.start ? span.end : span.start + 1;
  return { start: positionAt(span.start), end: positionAt(end) };
}

function defAtOffset(analysis: Analysis, offset: number): Span | undefined {
  const onDef = analysis.symbols.find((s) => s.kind !== "builtin" && spanContains(s.span, offset));
  if (onDef) {
    return onDef.span;
  }
  const link = analysis.links.find((l) => spanContains(l.use, offset));
  return link?.def;
}

export function definitionLocation(
  uri: string,
  analysis: Analysis,
  offset: number,
  positionAt: (offset: number) => Position,
): Location | undefined {
  const def = defAtOffset(analysis, offset);
  if (!def || (def.start === 0 && def.end === 0)) {
    return undefined;
  }
  return { uri, range: rangeFromSpan(def, positionAt) };
}

export function referenceLocations(
  uri: string,
  analysis: Analysis,
  offset: number,
  positionAt: (offset: number) => Position,
): Location[] {
  const def = defAtOffset(analysis, offset);
  if (!def) {
    return [];
  }
  const spans = [def, ...analysis.links.filter((l) => l.def.start === def.start && l.def.end === def.end).map((l) => l.use)];
  const seen = new Set<string>();
  const out: Location[] = [];
  for (const span of spans) {
    const key = `${span.start}:${span.end}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ uri, range: rangeFromSpan(span, positionAt) });
  }
  return out;
}

function symbolKind(kind: Binding["kind"]): SymbolKind {
  switch (kind) {
    case "function":
    case "builtin":
      return SymbolKind.Function;
    case "struct":
      return SymbolKind.Struct;
    case "trait":
      return SymbolKind.Interface;
    default:
      return SymbolKind.Variable;
  }
}

export function documentSymbols(
  uri: string,
  analysis: Analysis,
  positionAt: (offset: number) => Position,
): SymbolInformation[] {
  const seen = new Set<string>();
  const out: SymbolInformation[] = [];
  for (const s of analysis.symbols) {
    if (s.kind === "builtin" || s.kind === "param") {
      continue;
    }
    const key = `${s.name}:${s.span.start}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      name: s.name,
      kind: symbolKind(s.kind),
      location: { uri, range: rangeFromSpan(s.span, positionAt) },
    });
  }
  return out;
}
