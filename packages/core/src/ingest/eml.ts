import { createHash } from "node:crypto";
import type { InboundEmailMessage, EmailAttachment } from "./email-port.js";

/**
 * Minimal .eml parser for VS-4.1 maildrop dogfood.
 * Handles plain text and single-part base64 attachments — not full MIME edge cases.
 */
export function parseEml(raw: Buffer): InboundEmailMessage {
  const text = raw.toString("binary");
  const sep = text.indexOf("\r\n\r\n") >= 0 ? "\r\n\r\n" : "\n\n";
  const splitAt = text.indexOf(sep);
  const headerBlock = splitAt >= 0 ? text.slice(0, splitAt) : text;
  const bodyBlock = splitAt >= 0 ? text.slice(splitAt + sep.length) : "";

  const headers = parseHeaders(headerBlock);
  const messageId = unwrapHeader(headers["message-id"]) || `eml-${hashId(raw)}`;
  const subject = unwrapHeader(headers.subject) || "(no subject)";
  const from = unwrapHeader(headers.from) || "unknown";
  const to = unwrapHeader(headers.to) || "";

  const contentType = unwrapHeader(headers["content-type"]) || "text/plain";
  let bodyText = "";
  const attachments: EmailAttachment[] = [];

  if (contentType.toLowerCase().includes("multipart/")) {
    const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
    if (boundaryMatch) {
      const parts = splitMultipart(bodyBlock, boundaryMatch[1]!);
      for (const part of parts) {
        const partHeaders = parseHeaders(part.headers);
        const partType = unwrapHeader(partHeaders["content-type"]) || "text/plain";
        const disposition = unwrapHeader(partHeaders["content-disposition"]) || "";
        const encoding = unwrapHeader(partHeaders["content-transfer-encoding"]) || "";

        let content = decodePart(part.body, encoding);
        const filenameMatch =
          disposition.match(/filename="?([^";\n]+)"?/i) ||
          partType.match(/name="?([^";\n]+)"?/i);

        if (disposition.toLowerCase().includes("attachment") || filenameMatch) {
          attachments.push({
            filename: filenameMatch?.[1]?.trim() || "attachment.bin",
            mimeType: partType.split(";")[0]!.trim(),
            bytes: content,
          });
        } else if (partType.toLowerCase().includes("text/plain")) {
          bodyText += content.toString("utf8");
        }
      }
    }
  } else {
    const encoding = unwrapHeader(headers["content-transfer-encoding"]) || "";
    bodyText = decodePart(bodyBlock, encoding).toString("utf8");
  }

  return {
    messageId,
    subject,
    from,
    to,
    bodyText: bodyText.trim(),
    attachments,
  };
}

function parseHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = block.split(/\r?\n/);
  let current = "";
  for (const line of lines) {
    if (/^\s/.test(line)) {
      current += ` ${line.trim()}`;
      continue;
    }
    if (current) {
      const idx = current.indexOf(":");
      if (idx > 0) {
        headers[current.slice(0, idx).trim().toLowerCase()] = current.slice(idx + 1).trim();
      }
    }
    current = line;
  }
  if (current) {
    const idx = current.indexOf(":");
    if (idx > 0) {
      headers[current.slice(0, idx).trim().toLowerCase()] = current.slice(idx + 1).trim();
    }
  }
  return headers;
}

function splitMultipart(body: string, boundary: string): Array<{ headers: string; body: string }> {
  const delim = `--${boundary}`;
  const chunks = body.split(delim).slice(1);
  const parts: Array<{ headers: string; body: string }> = [];
  for (const chunk of chunks) {
    const trimmed = chunk.replace(/^\r?\n/, "").replace(/\r?\n--\s*$/, "");
    if (!trimmed || trimmed.startsWith("--")) continue;
    const sep = trimmed.indexOf("\r\n\r\n") >= 0 ? "\r\n\r\n" : "\n\n";
    const at = trimmed.indexOf(sep);
    if (at < 0) continue;
    parts.push({
      headers: trimmed.slice(0, at),
      body: trimmed.slice(at + sep.length),
    });
  }
  return parts;
}

function decodePart(body: string, encoding: string): Buffer {
  const enc = encoding.toLowerCase().trim();
  if (enc === "base64") {
    const cleaned = body.replace(/\s/g, "");
    return Buffer.from(cleaned, "base64");
  }
  return Buffer.from(body, "binary");
}

function unwrapHeader(value: string | undefined): string {
  return value?.trim() ?? "";
}

function hashId(raw: Buffer): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}
