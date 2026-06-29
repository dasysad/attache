import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EmailIngestPort, InboundEmailMessage } from "./email-port.js";
import { parseEml } from "./eml.js";
import { inboxDirForToken } from "./token.js";

export interface MaildropOptions {
  inboxBaseDir?: string;
}

/**
 * Live email adapter — reads forwarded .eml files from ~/.attache/inbox/{token}/.
 * After fetch, moves files to processed/ so poll is idempotent.
 */
export class MaildropEmailAdapter implements EmailIngestPort {
  readonly mode = "live" as const;

  constructor(private readonly options: MaildropOptions = {}) {}

  async fetchPending(ingestToken: string): Promise<InboundEmailMessage[]> {
    const inboxDir = inboxDirForToken(ingestToken, this.options.inboxBaseDir);
    mkdirSync(inboxDir, { recursive: true });
    const processedDir = join(inboxDir, "processed");
    mkdirSync(processedDir, { recursive: true });

    const entries = readdirSync(inboxDir, { withFileTypes: true });
    const messages: InboundEmailMessage[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".eml")) continue;
      const path = join(inboxDir, entry.name);
      const raw = readFileSync(path);
      messages.push(parseEml(raw));
      renameSync(path, join(processedDir, entry.name));
    }

    return messages;
  }
}

/** Copy an .eml file into the tenant maildrop (CLI dogfood helper). */
export function dropEmlIntoInbox(
  ingestToken: string,
  emlPath: string,
  emlBytes: Buffer,
  inboxBaseDir?: string,
): string {
  const inboxDir = inboxDirForToken(ingestToken, inboxBaseDir);
  mkdirSync(inboxDir, { recursive: true });
  const base = emlPath.split("/").pop() ?? "forwarded.eml";
  const dest = join(inboxDir, base.endsWith(".eml") ? base : `${base}.eml`);
  writeFileSync(dest, emlBytes, { mode: 0o600 });
  return dest;
}
