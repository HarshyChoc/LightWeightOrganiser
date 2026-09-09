const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  escapeHtml,
  validateBoard,
  readBoard,
} = require("../static/board-model.js");
const box = {
  text: "A thought",
  left: "20px",
  top: "40px",
  isSubtask: "false",
};
test("user task text cannot become HTML", () =>
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  ));
test("board validation rejects dangling edges", () =>
  assert.throws(
    () =>
      validateBoard({
        version: 1,
        boxes: [box],
        connections: [{ startIndex: 0, endIndex: 2 }],
      }),
    /missing card/,
  ));
test("board validation rejects invalid positions", () =>
  assert.throws(
    () =>
      validateBoard({
        version: 1,
        boxes: [{ ...box, left: "no" }],
        connections: [],
      }),
    /coordinates/,
  ));
test("legacy data is readable without rewriting storage", () => {
  let writes = 0;
  const board = readBoard({
    getItem: (k) => (k === "boxes" ? JSON.stringify([box]) : null),
    setItem: () => writes++,
  });
  assert.equal(board.boxes[0].text, "A thought");
  assert.equal(writes, 0);
});
test("corrupted saved data throws for a non-destructive recovery UI", () =>
  assert.throws(() => readBoard({ getItem: () => "{broken" })));
test("duplicate connections are normalized", () => {
  const edge = { startIndex: 0, endIndex: 1 };
  assert.equal(
    validateBoard({ version: 1, boxes: [box, box], connections: [edge, edge] })
      .connections.length,
    1,
  );
});
test("current board wins over stale legacy data", () => {
  const current = {
    version: 1,
    boxes: [{ ...box, text: "Current" }],
    connections: [],
  };
  const values = {
    "workflow-board-v1": JSON.stringify(current),
    boxes: JSON.stringify([box]),
  };
  assert.equal(
    readBoard({ getItem: (key) => values[key] ?? null }).boxes[0].text,
    "Current",
  );
});
test("cycles are preserved as a valid graph", () => {
  const board = validateBoard({
    version: 1,
    boxes: [box, { ...box, isSubtask: true }],
    connections: [
      { startIndex: 0, endIndex: 1 },
      { startIndex: 1, endIndex: 0 },
    ],
  });
  assert.equal(board.connections.length, 2);
  assert.equal(board.boxes[1].isSubtask, "true");
});
test("invalid current data never silently falls back to legacy data", () => {
  const values = { "workflow-board-v1": "{bad", boxes: JSON.stringify([box]) };
  assert.throws(() => readBoard({ getItem: (key) => values[key] ?? null }));
});
test("self connections and oversized card text are rejected", () => {
  assert.throws(
    () =>
      validateBoard({
        version: 1,
        boxes: [box],
        connections: [{ startIndex: 0, endIndex: 0 }],
      }),
    /missing card/,
  );
  assert.throws(
    () =>
      validateBoard({
        version: 1,
        boxes: [{ ...box, text: "x".repeat(20001) }],
        connections: [],
      }),
    /invalid text/,
  );
});
