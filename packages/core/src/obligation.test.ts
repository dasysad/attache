import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./db.js";
import { createTenant } from "./tenant.js";
import {
  createObligation,
  deleteObligation,
  getObligation,
  markObligationPaid,
  obligationDisplayStatus,
  updateObligation,
} from "./obligation.js";

describe("obligation management", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-ob-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    return { db };
  }

  it("updates unpaid obligation", () => {
    const { db } = setup();
    const ob = createObligation(db, {
      payee: "Rent",
      amountUsd: 1000,
      dueDate: "2099-06-01",
    });
    const updated = updateObligation(db, ob.id, {
      payee: "Landlord",
      amountUsd: 1100,
    });
    expect(updated.payee).toBe("Landlord");
    expect(updated.amountUsd).toBe(1100);
    db.close();
  });

  it("blocks update when paid", () => {
    const { db } = setup();
    const ob = createObligation(db, {
      payee: "Rent",
      amountUsd: 100,
      dueDate: "2099-06-01",
    });
    markObligationPaid(db, ob.id);
    expect(() => updateObligation(db, ob.id, { payee: "X" })).toThrow(/paid/i);
    db.close();
  });

  it("deletes obligation", () => {
    const { db } = setup();
    const ob = createObligation(db, {
      payee: "Gym",
      amountUsd: 30,
      dueDate: "2099-01-01",
    });
    deleteObligation(db, ob.id);
    expect(getObligation(db, ob.id)).toBeNull();
    db.close();
  });

  it("computes display status", () => {
    const { db } = setup();
    const paid = createObligation(db, {
      payee: "Old",
      amountUsd: 10,
      dueDate: "2020-01-01",
    });
    markObligationPaid(db, paid.id);
    expect(obligationDisplayStatus(getObligation(db, paid.id)!)).toBe("paid");

    const future = createObligation(db, {
      payee: "Future",
      amountUsd: 10,
      dueDate: "2099-12-01",
    });
    expect(obligationDisplayStatus(future)).toBe("upcoming");
    db.close();
  });

  it("rejects empty payee, bad date, non-positive amount, invalid cadence (negative)", () => {
    const { db } = setup();
    expect(() =>
      createObligation(db, { payee: "  ", amountUsd: 10, dueDate: "2099-01-01" }),
    ).toThrow(/payee required/);
    expect(() =>
      createObligation(db, { payee: "Rent", amountUsd: 10, dueDate: "01-01-2099" }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      createObligation(db, { payee: "Rent", amountUsd: 0, dueDate: "2099-01-01" }),
    ).toThrow(/positive/);
    expect(() =>
      createObligation(db, { payee: "Rent", amountUsd: -5, dueDate: "2099-01-01" }),
    ).toThrow(/positive/);
    expect(() =>
      createObligation(db, {
        payee: "Rent",
        amountUsd: 10,
        dueDate: "2099-01-01",
        cadence: "weekly" as "once",
      }),
    ).toThrow(/cadence/);
    db.close();
  });

  it("mark paid fails for unknown id and already-paid (negative)", () => {
    const { db } = setup();
    expect(() => markObligationPaid(db, "missing")).toThrow(
      /not found or already paid/,
    );
    const ob = createObligation(db, {
      payee: "Rent",
      amountUsd: 100,
      dueDate: "2099-06-01",
    });
    markObligationPaid(db, ob.id);
    expect(() => markObligationPaid(db, ob.id)).toThrow(/already paid/);
    db.close();
  });
});
