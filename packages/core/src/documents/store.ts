import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { DocumentArtifact } from "../domain.js";
import { defaultDocumentsDir } from "../db.js";
import { getTenant } from "../tenant.js";

interface ArtifactRow {
  id: string;
  tenant_id: string;
  filename: string;
  mime_type: string;
  storage_ref: string;
  sha256: string;
  byte_size: number;
  created_at: string;
}

function requireTenant(db: Database.Database): string {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");
  return tenant.id;
}

function mapRow(row: ArtifactRow): DocumentArtifact {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    filename: row.filename,
    mimeType: row.mime_type,
    storageRef: row.storage_ref,
    sha256: row.sha256,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  };
}

/**
 * Persist uploaded bytes under ~/.attache/documents/{tenant}/{id}/ and record metadata.
 * What: local artifact store for VS-4 dogfood (cloud R2 later).
 * Why: raw PDFs stay outside SQLite; extracted fields live in ingested_event.
 */
export function storeDocumentArtifact(
  db: Database.Database,
  input: {
    filename: string;
    mimeType: string;
    bytes: Buffer;
    documentsDir?: string;
  },
): DocumentArtifact {
  const tenantId = requireTenant(db);
  const id = randomUUID();
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const baseDir = input.documentsDir ?? defaultDocumentsDir();
  const relRef = join(tenantId, id, input.filename);
  const absPath = join(baseDir, relRef);
  mkdirSync(join(baseDir, tenantId, id), { recursive: true });
  writeFileSync(absPath, input.bytes, { mode: 0o600 });

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO document_artifact
     (id, tenant_id, filename, mime_type, storage_ref, sha256, byte_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.filename,
    input.mimeType,
    relRef,
    sha256,
    input.bytes.byteLength,
    now,
  );

  return mapRow(
    db.prepare("SELECT * FROM document_artifact WHERE id = ?").get(id) as ArtifactRow,
  );
}

export function getDocumentArtifact(
  db: Database.Database,
  artifactId: string,
): DocumentArtifact | null {
  const tenantId = requireTenant(db);
  const row = db
    .prepare("SELECT * FROM document_artifact WHERE id = ? AND tenant_id = ?")
    .get(artifactId, tenantId) as ArtifactRow | undefined;
  return row ? mapRow(row) : null;
}

export function readDocumentBytes(
  artifact: DocumentArtifact,
  documentsDir = defaultDocumentsDir(),
): Buffer {
  return readFileSync(join(documentsDir, artifact.storageRef));
}
