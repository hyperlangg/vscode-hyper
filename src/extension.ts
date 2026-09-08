import * as path from "path";
import { workspace, ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "hyper" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.hyp"),
    },
  };

  client = new LanguageClient("hyper-analyzer", "Hyper Analyzer", serverOptions, clientOptions);
  context.subscriptions.push({
    dispose: () => {
      void client?.stop();
    },
  });
  void client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
