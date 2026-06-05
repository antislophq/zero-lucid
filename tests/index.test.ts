import { describe, it, expect, vi, beforeEach } from "vitest";
import { LucidInternalTransaction } from "../src/index.js";

function makeLucidTx() {
  const exec = vi.fn().mockResolvedValue({ rows: [{ id: "row-1" }] });
  const rawQuery = vi.fn().mockReturnValue({ exec });
  return { rawQuery, exec, tx: { rawQuery } as any };
}

describe("LucidInternalTransaction.query()", () => {
  let lucidTxMock: ReturnType<typeof makeLucidTx>;

  beforeEach(() => {
    lucidTxMock = makeLucidTx();
  });

  it("rewrites $1, $2 placeholders to ? in the correct order", async () => {
    const internalTx = new LucidInternalTransaction(lucidTxMock.tx);

    await internalTx.query("SELECT * FROM users WHERE id = $1 AND name = $2", ["abc", "foo"]);

    expect(lucidTxMock.rawQuery).toHaveBeenCalledWith(
      "SELECT * FROM users WHERE id = ? AND name = ?",
      ["abc", "foo"],
    );
  });

  it("preserves out-of-order placeholder references ($2 before $1)", async () => {
    const internalTx = new LucidInternalTransaction(lucidTxMock.tx);

    await internalTx.query("SELECT $2, $1", ["first", "second"]);

    expect(lucidTxMock.rawQuery).toHaveBeenCalledWith("SELECT ?, ?", ["second", "first"]);
  });

  it("throws TypeError when a placeholder index is out of range", async () => {
    const internalTx = new LucidInternalTransaction(lucidTxMock.tx);

    await expect(internalTx.query("SELECT $2", ["only-one"])).rejects.toThrow(
      "Missing binding for $2",
    );
  });

  it("returns the rows from rawQuery result", async () => {
    const internalTx = new LucidInternalTransaction(lucidTxMock.tx);

    const rows = await internalTx.query("SELECT $1", ["x"]);

    expect(rows).toEqual([{ id: "row-1" }]);
  });

  it("passes through SQL with no placeholders unchanged", async () => {
    const internalTx = new LucidInternalTransaction(lucidTxMock.tx);

    await internalTx.query("SELECT 1", []);

    expect(lucidTxMock.rawQuery).toHaveBeenCalledWith("SELECT 1", []);
  });

  it("handles repeated use of the same placeholder", async () => {
    const internalTx = new LucidInternalTransaction(lucidTxMock.tx);

    await internalTx.query("SELECT $1, $1", ["value"]);

    expect(lucidTxMock.rawQuery).toHaveBeenCalledWith("SELECT ?, ?", ["value", "value"]);
  });

  it("throws TypeError for $0 (index below 1)", async () => {
    const internalTx = new LucidInternalTransaction(lucidTxMock.tx);

    await expect(internalTx.query("SELECT $0", ["x"])).rejects.toThrow(
      "Missing binding for $0",
    );
  });

  it("does not rewrite $ not followed by digits", async () => {
    const internalTx = new LucidInternalTransaction(lucidTxMock.tx);

    await internalTx.query("SELECT '$notaplaceholder'", []);

    expect(lucidTxMock.rawQuery).toHaveBeenCalledWith("SELECT '$notaplaceholder'", []);
  });
});
