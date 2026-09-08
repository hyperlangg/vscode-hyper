import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  Diagnostic,
  DiagnosticSeverity,
  TextDocumentSyncKind,
  Hover,
  MarkupKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { analyze, Analysis } from "./analyzer/semantic";
import { completions } from "./analyzer/complete";
import { AnalyzerDiagnostic } from "./analyzer/ast";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const cache = new Map<string, Analysis>();

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: {
      resolveProvider: false,
      triggerCharacters: [".", ":", ">"],
    },
    hoverProvider: true,
  },
  serverInfo: {
    name: "hyper-analyzer",
    version: "0.0.1",
  },
}));

function toDiagnostic(doc: TextDocument, d: AnalyzerDiagnostic): Diagnostic {
  const start = doc.positionAt(Math.max(0, d.span.start));
  let endOffset = d.span.end;
  if (endOffset <= d.span.start) {
    endOffset = Math.min(doc.getText().length, d.span.start + 1);
  }
  const end = doc.positionAt(endOffset);
  const formatted = `${d.kind}: line ${d.span.line}: ${d.message}`;
  return {
    severity: DiagnosticSeverity.Error,
    range: { start, end },
    message: formatted,
    source: "hyper-analyzer",
    code: d.kind,
  };
}

function refresh(doc: TextDocument): void {
  const analysis = analyze(doc.getText());
  cache.set(doc.uri, analysis);
  connection.sendDiagnostics({
    uri: doc.uri,
    diagnostics: analysis.diagnostics.map((d) => toDiagnostic(doc, d)),
  });
}

documents.onDidChangeContent((change) => {
  refresh(change.document);
});

documents.onDidClose((event) => {
  cache.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) {
    return [];
  }
  const analysis = cache.get(doc.uri) ?? analyze(doc.getText());
  const offset = doc.offsetAt(params.position);
  return completions(doc.getText(), offset, analysis.symbols);
});

connection.onHover((params): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) {
    return null;
  }
  const analysis = cache.get(doc.uri) ?? analyze(doc.getText());
  const offset = doc.offsetAt(params.position);

  const diagnostic = analysis.diagnostics.find((d) => offset >= d.span.start && offset <= Math.max(d.span.end, d.span.start + 1));
  if (diagnostic) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${diagnostic.kind}** (hyper-analyzer)\n\n${diagnostic.message}`,
      },
    };
  }

  const hover = analysis.hovers.find((h) => offset >= h.span.start && offset <= h.span.end);
  if (!hover) {
    return null;
  }
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: hover.markdown,
    },
  };
});

documents.listen(connection);
connection.listen();
