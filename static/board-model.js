(function (root) {
  "use strict";
  function escapeHtml(text) {
    return String(text).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function coordinate(value) {
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);
    if (!Number.isFinite(parsed))
      throw new Error("Card coordinates must be numbers.");
    return `${Math.max(0, Math.min(parsed, 20000))}px`;
  }
  function validateBoard(input) {
    if (
      !input ||
      input.version !== 1 ||
      !Array.isArray(input.boxes) ||
      !Array.isArray(input.connections)
    )
      throw new Error("Choose a version 1 board export.");
    if (input.boxes.length > 1000 || input.connections.length > 5000)
      throw new Error("This board exceeds the supported size.");
    const boxes = input.boxes.map((b) => {
      if (!b || typeof b.text !== "string" || b.text.length > 20000)
        throw new Error("A card contains invalid text.");
      return {
        left: coordinate(b.left),
        top: coordinate(b.top),
        text: b.text,
        isSubtask:
          b.isSubtask === true || b.isSubtask === "true" ? "true" : "false",
      };
    });
    const seen = new Set();
    const connections = input.connections
      .map((c) => {
        if (
          !c ||
          !Number.isInteger(c.startIndex) ||
          !Number.isInteger(c.endIndex) ||
          c.startIndex < 0 ||
          c.endIndex < 0 ||
          c.startIndex >= boxes.length ||
          c.endIndex >= boxes.length ||
          c.startIndex === c.endIndex
        )
          throw new Error("A connection refers to a missing card.");
        return { startIndex: c.startIndex, endIndex: c.endIndex };
      })
      .filter((c) => {
        const key = `${c.startIndex}:${c.endIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { version: 1, boxes, connections };
  }
  function readBoard(storage) {
    const current = storage.getItem("workflow-board-v1");
    if (current !== null) return validateBoard(JSON.parse(current));
    return validateBoard({
      version: 1,
      boxes: JSON.parse(storage.getItem("boxes") || "[]"),
      connections: JSON.parse(storage.getItem("connections") || "[]"),
    });
  }
  const api = { escapeHtml, validateBoard, readBoard };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BoardModel = api;
})(typeof window !== "undefined" ? window : globalThis);
