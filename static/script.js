document.addEventListener("DOMContentLoaded", function () {
  const canvas = document.getElementById("canvas");
  let isDragging = false;
  let currentBox = null;
  let offset = { x: 0, y: 0 };
  let connections = [];
  let selectedBox = null;
  let persistenceBlocked = false;
  let savedDataUnreadable = false;
  let hydrating = false;
  const undoHistory = [];
  let lastSaved = null;
  const statusLine = document.getElementById("save-status");
  function status(message) {
    statusLine.textContent = message;
  }

  const modal = document.getElementById("tutorial-modal");
  const startButton = document.getElementById("start-button");
  const dontShowCheckbox = document.getElementById("dont-show-again");
  const helpButton = document.getElementById("help-button");

  // Initial check for tutorial display
  let tutorialSeen = false;
  try {
    tutorialSeen = localStorage.getItem("tutorialSeen") === "true";
  } catch {}
  if (tutorialSeen) {
    modal.style.display = "none";
  } else {
    showTutorial();
  }

  function showTutorial() {
    modal.style.display = "flex";
    startButton.focus();
  }

  startButton.addEventListener("click", function () {
    modal.style.display = "none";
    if (dontShowCheckbox.checked) {
      try {
        localStorage.setItem("tutorialSeen", "true");
      } catch {}
    }
  });

  helpButton.addEventListener("click", showTutorial);

  // Close modal if clicking outside
  modal.addEventListener("click", function (e) {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  // Double click to create new thought box
  canvas.addEventListener("dblclick", function (e) {
    if (e.target === canvas) {
      createThoughtBox(e.clientX, e.clientY);
    }
  });

  function createThoughtBox(x, y, focus = true) {
    const box = document.createElement("div");
    box.className = "thought-box";
    const rect = canvas.getBoundingClientRect();
    box.style.left = Math.max(0, x - rect.left + canvas.scrollLeft - 75) + "px";
    box.style.top = Math.max(0, y - rect.top + canvas.scrollTop - 50) + "px";
    box.setAttribute("data-is-subtask", "false");
    box.style.willChange = "transform"; // Optimize for animations

    const textarea = document.createElement("textarea");
    textarea.placeholder = "Enter your task here...";
    textarea.setAttribute("aria-label", "Task text");
    textarea.maxLength = 20000;
    box.appendChild(textarea);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    for (const [label, action] of [
      ["Connect", () => handleConnection(box)],
      [
        "Subtask",
        () => {
          toggleSubtask(box);
          saveState();
        },
      ],
      ["Delete", () => deleteBox(box)],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.className = "card-" + label.toLowerCase();
      button.addEventListener("mousedown", (event) => event.stopPropagation());
      button.addEventListener("click", action);
      actions.appendChild(button);
    }
    box.appendChild(actions);

    // Make the box draggable
    box.addEventListener("mousedown", function (e) {
      if (!e.ctrlKey) {
        // Only drag if Ctrl is not pressed
        startDragging(e);
      }
    });

    // Add connection functionality with Ctrl+Click
    box.addEventListener("mousedown", function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        handleConnection(box);
      }
    });

    // Ctrl-click is reserved for connecting, including on macOS.
    box.addEventListener("contextmenu", function (e) {
      if (e.target.closest("textarea")) return;
      e.preventDefault();
      if (e.ctrlKey) return;
      if (selectedBox === box) {
        selectedBox = null;
      }
      deleteBox(box);
    });

    canvas.appendChild(box);
    if (focus) textarea.focus();

    // Prevent textarea from interfering with ctrl+click
    textarea.addEventListener("mousedown", function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        box.dispatchEvent(new MouseEvent("mousedown", e));
      }
    });

    return box;
  }

  function deleteBox(box) {
    if (selectedBox === box) selectedBox = null;
    // Remove all connections associated with this box
    connections = connections.filter((conn) => {
      if (conn.start === box || conn.end === box) {
        conn.line.remove();
        return false;
      }
      return true;
    });
    box.remove();
  }

  function createConnection(start, end) {
    if (
      start === end ||
      connections.some(
        (connection) => connection.start === start && connection.end === end,
      )
    )
      return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "arrow");
    svg.style.position = "absolute";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.pointerEvents = "none";
    svg.style.zIndex = "1";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("stroke", "#1D1D1F");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("fill", "none");
    path.setAttribute("marker-end", "url(#arrowhead)");
    path.style.cursor = "pointer";
    path.style.pointerEvents = "stroke";

    // Create the connection object first
    const connection = { start, end, line: svg };

    path.addEventListener("mouseenter", () => {
      path.setAttribute("stroke", "#FF3B30");
      const marker = document.querySelector("#arrowhead");
      if (marker) {
        marker.querySelector("polygon").setAttribute("fill", "#FF3B30");
      }
    });

    path.addEventListener("mouseleave", () => {
      path.setAttribute("stroke", "#1D1D1F");
      const marker = document.querySelector("#arrowhead");
      if (marker) {
        marker.querySelector("polygon").setAttribute("fill", "#1D1D1F");
      }
    });

    path.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteConnection(connection);
    });

    svg.appendChild(path);
    canvas.appendChild(svg);

    connections.push(connection);
    updateConnection(connection);
  }

  function deleteConnection(connection) {
    connections = connections.filter((conn) => conn !== connection);
    connection.line.remove();
  }

  function findBestConnectionPoints(startBox, endBox) {
    const startRect = startBox.getBoundingClientRect();
    const endRect = endBox.getBoundingClientRect();

    // Define connection points (top, right, bottom, left)
    const startPoints = [
      {
        x: startRect.left + startRect.width / 2,
        y: startRect.top,
        side: "top",
      },
      {
        x: startRect.right,
        y: startRect.top + startRect.height / 2,
        side: "right",
      },
      {
        x: startRect.left + startRect.width / 2,
        y: startRect.bottom,
        side: "bottom",
      },
      {
        x: startRect.left,
        y: startRect.top + startRect.height / 2,
        side: "left",
      },
    ];

    const endPoints = [
      { x: endRect.left + endRect.width / 2, y: endRect.top, side: "top" },
      { x: endRect.right, y: endRect.top + endRect.height / 2, side: "right" },
      {
        x: endRect.left + endRect.width / 2,
        y: endRect.bottom,
        side: "bottom",
      },
      { x: endRect.left, y: endRect.top + endRect.height / 2, side: "left" },
    ];

    // Find the closest points between boxes
    let shortestDistance = Infinity;
    let bestStart = null;
    let bestEnd = null;

    startPoints.forEach((start) => {
      endPoints.forEach((end) => {
        const distance = Math.hypot(end.x - start.x, end.y - start.y);
        if (distance < shortestDistance) {
          shortestDistance = distance;
          bestStart = start;
          bestEnd = end;
        }
      });
    });

    return { start: bestStart, end: bestEnd };
  }

  function calculateControlPoints(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);

    // Determine control point offsets based on connection sides
    let cp1Offset = distance * 0.25;
    let cp2Offset = distance * 0.25;

    let cp1 = { x: start.x, y: start.y };
    let cp2 = { x: end.x, y: end.y };

    // Adjust control points based on connection sides
    switch (start.side) {
      case "right":
        cp1.x += cp1Offset;
        break;
      case "left":
        cp1.x -= cp1Offset;
        break;
      case "top":
        cp1.y -= cp1Offset;
        break;
      case "bottom":
        cp1.y += cp1Offset;
        break;
    }

    switch (end.side) {
      case "right":
        cp2.x += cp2Offset;
        break;
      case "left":
        cp2.x -= cp2Offset;
        break;
      case "top":
        cp2.y -= cp2Offset;
        break;
      case "bottom":
        cp2.y += cp2Offset;
        break;
    }

    return { cp1, cp2 };
  }

  function updateConnection(connection) {
    const points = findBestConnectionPoints(connection.start, connection.end);
    const { cp1, cp2 } = calculateControlPoints(points.start, points.end);

    const path = connection.line.querySelector("path");

    // Get canvas offset for proper positioning
    const canvasRect = canvas.getBoundingClientRect();
    const startX = points.start.x - canvasRect.left + canvas.scrollLeft;
    const startY = points.start.y - canvasRect.top + canvas.scrollTop;
    const endX = points.end.x - canvasRect.left + canvas.scrollLeft;
    const endY = points.end.y - canvasRect.top + canvas.scrollTop;

    // Adjust control points
    cp1.x += canvas.scrollLeft - canvasRect.left;
    cp1.y += canvas.scrollTop - canvasRect.top;
    cp2.x += canvas.scrollLeft - canvasRect.left;
    cp2.y += canvas.scrollTop - canvasRect.top;

    // Create a curved path using cubic Bezier curve with adjusted coordinates
    const pathData = `M ${startX} ${startY}
                         C ${cp1.x} ${cp1.y},
                           ${cp2.x} ${cp2.y},
                           ${endX} ${endY}`;

    path.setAttribute("d", pathData);
  }

  function startDragging(e) {
    if (e.target.classList.contains("thought-box")) {
      isDragging = true;
      currentBox = e.target;

      // Get initial mouse position relative to box position
      offset = {
        x: e.clientX + canvas.scrollLeft - currentBox.offsetLeft,
        y: e.clientY + canvas.scrollTop - currentBox.offsetTop,
      };
    }
  }

  document.addEventListener("mousemove", function (e) {
    if (isDragging && currentBox) {
      // Calculate new position
      const newX = Math.max(
        0,
        Math.min(20000, e.clientX + canvas.scrollLeft - offset.x),
      );
      const newY = Math.max(
        0,
        Math.min(20000, e.clientY + canvas.scrollTop - offset.y),
      );

      // Update box position
      currentBox.style.left = newX + "px";
      currentBox.style.top = newY + "px";

      // Update connections
      connections.forEach((conn) => {
        if (conn.start === currentBox || conn.end === currentBox) {
          updateConnection(conn);
        }
      });
    }
  });

  document.addEventListener("mouseup", function () {
    if (isDragging) saveState();
    isDragging = false;
    currentBox = null;
  });

  // Add keyboard escape to cancel connection
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && selectedBox) {
      selectedBox.style.border = "1px solid #E5E5E7";
      selectedBox.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
      selectedBox = null;
    }
  });

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  defs.style.position = "absolute";
  defs.style.width = "0";
  defs.style.height = "0";
  defs.innerHTML = `
        <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6"
                refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#1D1D1F"/>
            </marker>
        </defs>
    `;
  document.body.appendChild(defs);

  const tutorialSteps = document.querySelector(".tutorial-steps");
  const deleteSteps = document.createElement("div");
  deleteSteps.className = "step";
  deleteSteps.innerHTML = `
        <h3>5. Keep your work</h3>
        <p>• Right-click on any connection line to delete it</p>
        <p>• Use Undo to recover an edit; Export saves a portable backup.</p>
    `;
  tutorialSteps.appendChild(deleteSteps);

  const style = document.createElement("style");
  style.textContent = `
        .arrow path {
            transition: stroke 0.2s ease;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        .arrow path:hover {
            stroke-width: 2;
        }
    `;
  document.head.appendChild(style);

  function generateToDoList() {
    const boxes = Array.from(document.querySelectorAll(".thought-box"));
    const taskMap = new Map();
    const checklistRows = new Map();

    // Initialize maps
    boxes.forEach((box) => {
      taskMap.set(box, []);
    });

    // Build connection graph
    connections.forEach((conn) => {
      taskMap.get(conn.start).push(conn.end);
    });

    // Find main tasks (not marked as subtasks)
    const mainTasks = boxes.filter(
      (box) => box.getAttribute("data-is-subtask") !== "true",
    );

    // Generate the todo list HTML
    const todoListContainer = document.getElementById("todo-list-container");
    todoListContainer.innerHTML = "";
    const todoList = document.createElement("ul");
    todoList.className = "todo-list";

    const listedTasks = new Set();
    // Process each main task
    mainTasks.forEach((task, index) => {
      buildTaskHierarchy(task, 0, `${index + 1}`);
    });

    boxes
      .filter((box) => !listedTasks.has(box))
      .forEach((task, index) =>
        buildTaskHierarchy(task, 0, `${mainTasks.length + index + 1}`),
      );

    function buildTaskHierarchy(task, level = 0, taskNumber = "") {
      if (listedTasks.has(task)) return;
      listedTasks.add(task);
      const text =
        task.querySelector("textarea").value.trim() || "Untitled Task";
      const listItem = document.createElement("li");
      const isSubtask = task.getAttribute("data-is-subtask") === "true";

      listItem.className = `todo-item ${isSubtask ? "subtask" : "main-task"}`;

      const connectedTasks = taskMap.get(task) || [];
      const connectedSubtasks = connectedTasks.filter(
        (t) => t.getAttribute("data-is-subtask") === "true",
      );

      listItem.innerHTML = `
                <input type="checkbox" class="todo-checkbox">
                <div class="todo-text-container">
                    <div class="todo-text">
                        ${BoardModel.escapeHtml(text)}
                        ${!isSubtask ? `<span class="task-number">${taskNumber}</span>` : ""}
                    </div>
                    ${
                      connectedSubtasks.length > 0
                        ? `
                        <div class="subtask-count">
                            ${connectedSubtasks.length} subtask${connectedSubtasks.length > 1 ? "s" : ""}
                        </div>
                    `
                        : ""
                    }
                </div>
            `;

      const checkbox = listItem.querySelector(".todo-checkbox");
      checkbox.setAttribute("aria-label", `Complete ${text}`);
      checklistRows.set(task, { checkbox, listItem });
      checkbox.addEventListener("change", () => {
        const checked = checkbox.checked;
        listItem.classList.toggle("completed", checked);
        const visited = new Set([task]);
        function completeChildren(parent) {
          for (const child of taskMap.get(parent) || []) {
            if (
              visited.has(child) ||
              child.getAttribute("data-is-subtask") !== "true"
            )
              continue;
            visited.add(child);
            const row = checklistRows.get(child);
            if (row) {
              row.checkbox.checked = checked;
              row.listItem.classList.toggle("completed", checked);
            }
            completeChildren(child);
          }
        }
        completeChildren(task);
      });

      // Add data attribute to link subtasks to their parent
      if (taskNumber) {
        listItem.setAttribute("data-parent", taskNumber);
      }

      todoList.appendChild(listItem);

      // Process connected subtasks
      if (connectedSubtasks.length > 0) {
        connectedSubtasks.forEach((subtask) => {
          buildTaskHierarchy(subtask, level + 1);
        });
      }
    }

    if (!boxes.length) {
      const empty = document.createElement("p");
      empty.textContent = "Add a card to your canvas, then generate your list.";
      todoListContainer.appendChild(empty);
    }
    todoListContainer.appendChild(todoList);

    // Show the modal
    const todoModal = document.getElementById("todo-modal");
    todoModal.style.display = "flex";
    document.getElementById("close-todo-button").focus();
  }

  // Add event listeners for the todo list modal
  const generateListButton = document.getElementById("generate-list-button");
  const todoModal = document.getElementById("todo-modal");
  const closeTodoButton = document.getElementById("close-todo-button");

  generateListButton.addEventListener("click", generateToDoList);

  closeTodoButton.addEventListener("click", () => {
    todoModal.style.display = "none";
  });

  todoModal.addEventListener("click", function (e) {
    if (e.target === todoModal) {
      todoModal.style.display = "none";
    }
  });

  function handleConnection(box) {
    if (!selectedBox) {
      selectedBox = box;
      box.style.border = "2px solid #000000";
      box.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)";
    } else if (selectedBox !== box) {
      createConnection(selectedBox, box);
      selectedBox.style.border = "1px solid #E5E5E7";
      selectedBox.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
      selectedBox = null;
    } else {
      // Deselect if clicking the same box
      selectedBox.style.border = "1px solid #E5E5E7";
      selectedBox.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
      selectedBox = null;
    }
  }

  function toggleSubtask(box) {
    const isSubtask = box.getAttribute("data-is-subtask") === "true";
    box.setAttribute("data-is-subtask", (!isSubtask).toString());

    box.classList.toggle("subtask", !isSubtask);
    const button = box.querySelector(".card-subtask");
    button.textContent = !isSubtask ? "Main task" : "Subtask";
    button.setAttribute("aria-pressed", String(!isSubtask));

    // Update connections immediately
    connections.forEach((conn) => {
      if (conn.start === box || conn.end === box) {
        updateConnection(conn);
      }
    });
  }

  // Add save functionality
  function snapshot() {
    const boxes = Array.from(canvas.querySelectorAll(".thought-box"));
    return BoardModel.validateBoard({
      version: 1,
      boxes: boxes.map((box) => ({
        left: box.style.left,
        top: box.style.top,
        text: box.querySelector("textarea").value,
        isSubtask: box.getAttribute("data-is-subtask"),
      })),
      connections: connections.map((conn) => ({
        startIndex: boxes.indexOf(conn.start),
        endIndex: boxes.indexOf(conn.end),
      })),
    });
  }
  function saveState() {
    if (hydrating || persistenceBlocked) return;
    try {
      const serialized = JSON.stringify(snapshot());
      localStorage.setItem("workflow-board-v1", serialized);
      if (lastSaved && lastSaved !== serialized) {
        undoHistory.push(lastSaved);
        if (undoHistory.length > 30) undoHistory.shift();
      }
      lastSaved = serialized;
      status("Saved on this browser");
    } catch (error) {
      status("Could not save locally. Export a backup before closing.");
    }
  }
  function restore(board) {
    hydrating = true;
    selectedBox = null;
    isDragging = false;
    currentBox = null;
    connections.forEach((conn) => conn.line.remove());
    connections = [];
    canvas.querySelectorAll(".thought-box").forEach((box) => box.remove());
    const boxes = board.boxes.map((data) => {
      const rect = canvas.getBoundingClientRect();
      const box = createThoughtBox(
        parseFloat(data.left) + 75 + rect.left - canvas.scrollLeft,
        parseFloat(data.top) + 50 + rect.top - canvas.scrollTop,
        false,
      );
      box.querySelector("textarea").value = data.text;
      if (data.isSubtask === "true") toggleSubtask(box);
      return box;
    });
    board.connections.forEach((c) =>
      createConnection(boxes[c.startIndex], boxes[c.endIndex]),
    );
    hydrating = false;
  }
  function loadState() {
    try {
      const board = BoardModel.readBoard(localStorage);
      restore(board);
      lastSaved = JSON.stringify(board);
      status("Saved on this browser");
    } catch (error) {
      persistenceBlocked = true;
      savedDataUnreadable = true;
      status(
        "Saved board could not be read. Existing data is preserved; export it before importing a replacement.",
      );
    }
  }

  // Load saved state when page loads
  loadState();

  // Capture text edits and structural changes before navigation can interrupt them.
  canvas.addEventListener("input", saveState);
  canvas.addEventListener("dblclick", saveState);
  window.addEventListener("pagehide", saveState);
  window.addEventListener("resize", () =>
    connections.forEach(updateConnection),
  );
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== "workflow-board-v1") return;
    if (event.key !== null && event.newValue === lastSaved) return;
    persistenceBlocked = true;
    status(
      "This board changed in another tab. Export your current work, then reload to load the other version.",
    );
  });
  for (const dialog of [modal, todoModal]) {
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        dialog.style.display = "none";
        (dialog === modal ? helpButton : generateListButton).focus();
      }
      if (event.key === "Tab") {
        const controls = [...dialog.querySelectorAll("button, input")].filter(
          (control) => !control.disabled,
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  const originalDeleteBox = deleteBox;
  deleteBox = function (box) {
    originalDeleteBox(box);
    saveState();
  };
  const originalCreateConnection = createConnection;
  createConnection = function (start, end) {
    originalCreateConnection(start, end);
    saveState();
  };
  const originalDeleteConnection = deleteConnection;
  deleteConnection = function (connection) {
    originalDeleteConnection(connection);
    saveState();
  };

  document.getElementById("add-card").addEventListener("click", () => {
    createThoughtBox(
      Math.max(100, innerWidth / 2),
      Math.max(190, innerHeight / 2),
    );
    saveState();
  });
  document.getElementById("undo").addEventListener("click", () => {
    if (!undoHistory.length || persistenceBlocked) return;
    const previous = undoHistory.pop();
    restore(BoardModel.validateBoard(JSON.parse(previous)));
    lastSaved = previous;
    try {
      localStorage.setItem("workflow-board-v1", previous);
      status("Undone · saved locally");
    } catch {
      status("Could not save undo; export your board.");
    }
  });
  document.getElementById("export-board").addEventListener("click", () => {
    try {
      const raw = savedDataUnreadable
        ? localStorage.getItem("workflow-board-v1") ||
          JSON.stringify({
            boxes: localStorage.getItem("boxes"),
            connections: localStorage.getItem("connections"),
          })
        : JSON.stringify(snapshot(), null, 2);
      const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "lightweight-board.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      status("Export failed: " + error.message);
    }
  });
  document
    .querySelector(".import-label")
    .addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        document.getElementById("import-board").click();
      }
    });
  document
    .getElementById("import-board")
    .addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        if (file.size > 2_000_000)
          throw new Error("Choose a board smaller than 2 MB.");
        const board = BoardModel.validateBoard(JSON.parse(await file.text()));
        const previous = savedDataUnreadable
          ? localStorage.getItem("workflow-board-v1")
          : JSON.stringify(snapshot());
        if (previous) localStorage.setItem("workflow-board-backup", previous);
        localStorage.setItem("workflow-board-v1", JSON.stringify(board));
        if (!savedDataUnreadable && previous) {
          undoHistory.push(previous);
          if (undoHistory.length > 30) undoHistory.shift();
        }
        persistenceBlocked = false;
        savedDataUnreadable = false;
        restore(board);
        lastSaved = JSON.stringify(board);
        status("Imported · previous board backed up locally");
      } catch (error) {
        status("Import failed: " + error.message);
      } finally {
        event.target.value = "";
      }
    });
});
