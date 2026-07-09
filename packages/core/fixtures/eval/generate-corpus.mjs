#!/usr/bin/env node
/**
 * Generate the bill extraction eval corpus (50 structured text fixtures).
 *
 * Run from repo root:
 *   node packages/core/fixtures/eval/generate-corpus.mjs
 *
 * WHY: PRD OCR strategy targets a ~50-bill corpus; this keeps fixtures diverse
 *      and reproducible without hand-authoring 50 files.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = 50;

const PAYEES = [
  "City Water Department",
  "Metro Electric Cooperative",
  "Pacific Gas & Electric",
  "Comcast Xfinity",
  "Verizon Wireless",
  "AT&T Fiber",
  "State Farm Insurance",
  "Geico Auto Insurance",
  "Progressive Home",
  "Netflix",
  "Spotify Premium",
  "Adobe Creative Cloud",
  "Amazon Prime",
  "Apple iCloud+",
  "Google Workspace",
  "Dropbox Plus",
  "Planet Fitness",
  "LA Fitness",
  "HBO Max",
  "Disney+",
  "Hulu Live TV",
  "YouTube TV",
  "T-Mobile Home Internet",
  "Spectrum Cable",
  "Cox Communications",
  "National Grid",
  "Con Edison",
  "Duke Energy",
  "Florida Power & Light",
  "Austin Energy",
  "Seattle Public Utilities",
  "Chicago Water",
  "Denver Trash & Recycling",
  "HOA — Maple Ridge",
  "Rent — Oak Street Apartments",
  "Student Loan Servicing",
  "Chase Auto Loan",
  "Toyota Financial",
  "American Express",
  "Chase Sapphire",
  "Capital One Venture",
  "Discover Card",
  "Wells Fargo Mortgage",
  "Rocket Mortgage",
  "Kaiser Permanente",
  "Blue Cross Blue Shield",
  "Aetna Health",
  "UnitedHealthcare",
  "Ring Security",
  "ADT Home Security",
];

const CADENCES = ["monthly", "yearly", "once"];

/** Deterministic PRNG for reproducible corpus. */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDate(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function usDate(m, d, y) {
  return `${m}/${d}/${y}`;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

const rand = mulberry32(0x4a7fa001);

const cases = [];
for (let i = 0; i < TARGET; i += 1) {
  const payee = PAYEES[i % PAYEES.length];
  const id = `bill-${String(i + 1).padStart(2, "0")}-${slugify(payee)}`;
  const file = `${id}.txt`;

  const amountUsd = Math.round((12 + rand() * 498) * 100) / 100;
  const cadence = CADENCES[i % CADENCES.length];
  const autopay = i % 3 === 0;
  const useVendorKey = i % 7 === 0;
  const useUsDate = i % 5 === 0;

  const year = 2026;
  const month = 1 + (i % 12);
  const day = 1 + (i % 28);
  const dueDate = isoDate(year, month, day);
  const dueLine = useUsDate ? usDate(month, day, year) : dueDate;

  const payeeKey = useVendorKey ? "Vendor" : "Payee";
  const amountStr =
    i % 4 === 0 ? `$${amountUsd.toFixed(2)}` : amountUsd.toFixed(2);

  const body = [
    `# Eval fixture ${i + 1} — ${payee}`,
    `${payeeKey}: ${payee}`,
    `Amount: ${amountStr}`,
    `Due: ${dueLine}`,
    `Cadence: ${cadence}`,
    `Autopay: ${autopay ? "yes" : "false"}`,
    "",
  ].join("\n");

  writeFileSync(join(__dirname, file), body, "utf8");

  cases.push({
    id,
    file,
    expected: { payee, amountUsd, dueDate, cadence, autopay },
  });
}

const manifest = {
  version: 1,
  description:
    "Bill extraction eval corpus — 50 structured text bills (PRD OCR strategy)",
  cases,
};

writeFileSync(join(__dirname, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${TARGET} fixtures + manifest.json to ${__dirname}`);
