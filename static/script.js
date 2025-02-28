document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('canvas');
    let isDragging = false;
    let currentBox = null;
    let offset = { x: 0, y: 0 };
    let connections = [];
    let selectedBox = null;
    let longPressTimer;
    const longPressDuration = 500; // 500ms for long press
    let contextMenu = null;

    // Add this at the beginning of your existing DOMContentLoaded function
    const modal = document.getElementById('tutorial-modal');
    const startButton = document.getElementById('start-button');
    const dontShowCheckbox = document.getElementById('dont-show-again');
    const helpButton = document.getElementById('help-button');

    // Check if we should show the tutorial
    if (!localStorage.getItem('tutorialSeen')) {
        showTutorial();
    }

    function showTutorial() {
        modal.style.display = 'flex';
    }

    startButton.addEventListener('click', function() {
        modal.style.display = 'none';
        if (dontShowCheckbox.checked) {
            localStorage.setItem('tutorialSeen', 'true');
        }
    });

    helpButton.addEventListener('click', showTutorial);

    // Close modal if clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Double click to create new thought box
    canvas.addEventListener('dblclick', function(e) {
        if (e.target === canvas) {
            createThoughtBox(e.clientX, e.clientY);
        }
    });

    function createThoughtBox(x, y) {
        const box = document.createElement('div');
        box.className = 'thought-box';
        box.style.left = (x - 75) + 'px';
        box.style.top = (y - 50) + 'px';
        box.setAttribute('data-is-subtask', 'false');
        box.style.willChange = 'transform'; // Optimize for animations

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Enter your task here...';
        box.appendChild(textarea);

        // Make the box draggable
        box.addEventListener('mousedown', function(e) {
            if (!e.ctrlKey) { // Only drag if Ctrl is not pressed
                startDragging(e);
            }
        });
        
        // Add connection functionality with Ctrl+Click
        box.addEventListener('mousedown', function(e) {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                handleConnection(e, box);
            }
        });

        // Add right-click deletion
        box.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            if (selectedBox === box) {
                selectedBox = null;
            }
            deleteBox(box);
        });

        canvas.appendChild(box);
        textarea.focus();

        // Prevent textarea from interfering with ctrl+click
        textarea.addEventListener('mousedown', function(e) {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                box.dispatchEvent(new MouseEvent('mousedown', e));
            }
        });

        let pressTimer;
        box.addEventListener('mousedown', function(e) {
            if (e.ctrlKey) return; // Don't trigger for ctrl+click
            
            pressTimer = setTimeout(() => {
                handleLongPress(e, box);
            }, 500);
        });

        box.addEventListener('mouseup', () => clearTimeout(pressTimer));
        box.addEventListener('mouseleave', () => clearTimeout(pressTimer));
    }

    function deleteBox(box) {
        // Remove all connections associated with this box
        connections = connections.filter(conn => {
            if (conn.start === box || conn.end === box) {
                conn.line.remove();
                return false;
            }
            return true;
        });
        box.remove();
    }

    function createConnection(start, end) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'arrow');
        svg.style.position = 'absolute';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '1';
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke', '#1D1D1F');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', 'url(#arrowhead)');
        path.style.cursor = 'pointer';
        path.style.pointerEvents = 'stroke';
        
        // Create the connection object first
        const connection = { start, end, line: svg };
        
        path.addEventListener('mouseenter', () => {
            path.setAttribute('stroke', '#FF3B30');
            const marker = document.querySelector('#arrowhead');
            if (marker) {
                marker.querySelector('polygon').setAttribute('fill', '#FF3B30');
            }
        });
        
        path.addEventListener('mouseleave', () => {
            path.setAttribute('stroke', '#1D1D1F');
            const marker = document.querySelector('#arrowhead');
            if (marker) {
                marker.querySelector('polygon').setAttribute('fill', '#1D1D1F');
            }
        });
        
        path.addEventListener('contextmenu', (e) => {
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
        connections = connections.filter(conn => conn !== connection);
        connection.line.remove();
    }

    function findBestConnectionPoints(startBox, endBox) {
        const startRect = startBox.getBoundingClientRect();
        const endRect = endBox.getBoundingClientRect();
        
        // Define connection points (top, right, bottom, left)
        const startPoints = [
            { x: startRect.left + startRect.width/2, y: startRect.top, side: 'top' },
            { x: startRect.right, y: startRect.top + startRect.height/2, side: 'right' },
            { x: startRect.left + startRect.width/2, y: startRect.bottom, side: 'bottom' },
            { x: startRect.left, y: startRect.top + startRect.height/2, side: 'left' }
        ];
        
        const endPoints = [
            { x: endRect.left + endRect.width/2, y: endRect.top, side: 'top' },
            { x: endRect.right, y: endRect.top + endRect.height/2, side: 'right' },
            { x: endRect.left + endRect.width/2, y: endRect.bottom, side: 'bottom' },
            { x: endRect.left, y: endRect.top + endRect.height/2, side: 'left' }
        ];
        
        // Find the closest points between boxes
        let shortestDistance = Infinity;
        let bestStart = null;
        let bestEnd = null;
        
        startPoints.forEach(start => {
            endPoints.forEach(end => {
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
        switch(start.side) {
            case 'right': cp1.x += cp1Offset; break;
            case 'left': cp1.x -= cp1Offset; break;
            case 'top': cp1.y -= cp1Offset; break;
            case 'bottom': cp1.y += cp1Offset; break;
        }
        
        switch(end.side) {
            case 'right': cp2.x += cp2Offset; break;
            case 'left': cp2.x -= cp2Offset; break;
            case 'top': cp2.y -= cp2Offset; break;
            case 'bottom': cp2.y += cp2Offset; break;
        }
        
        return { cp1, cp2 };
    }

    function updateConnection(connection) {
        const points = findBestConnectionPoints(connection.start, connection.end);
        const { cp1, cp2 } = calculateControlPoints(points.start, points.end);
        
        const path = connection.line.querySelector('path');
        
        // Get canvas offset for proper positioning
        const canvasRect = canvas.getBoundingClientRect();
        const startX = points.start.x - canvasRect.left;
        const startY = points.start.y - canvasRect.top;
        const endX = points.end.x - canvasRect.left;
        const endY = points.end.y - canvasRect.top;
        
        // Adjust control points
        cp1.x -= canvasRect.left;
        cp1.y -= canvasRect.top;
        cp2.x -= canvasRect.left;
        cp2.y -= canvasRect.top;
        
        // Create a curved path using cubic Bezier curve with adjusted coordinates
        const pathData = `M ${startX} ${startY} 
                         C ${cp1.x} ${cp1.y},
                           ${cp2.x} ${cp2.y},
                           ${endX} ${endY}`;
        
        path.setAttribute('d', pathData);
    }

    function startDragging(e) {
        if (e.target.classList.contains('thought-box')) {
            isDragging = true;
            currentBox = e.target;
            
            // Get initial mouse position relative to box position
            offset = {
                x: e.pageX - currentBox.offsetLeft,
                y: e.pageY - currentBox.offsetTop
            };
        }
    }

    document.addEventListener('mousemove', function(e) {
        if (isDragging && currentBox) {
            // Calculate new position
            const newX = e.pageX - offset.x;
            const newY = e.pageY - offset.y;
            
            // Update box position
            currentBox.style.left = newX + 'px';
            currentBox.style.top = newY + 'px';
            
            // Update connections
            connections.forEach(conn => {
                if (conn.start === currentBox || conn.end === currentBox) {
                    updateConnection(conn);
                }
            });
        }
    });

    document.addEventListener('mouseup', function() {
        isDragging = false;
        currentBox = null;
    });

    // Add keyboard escape to cancel connection
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && selectedBox) {
            selectedBox.style.border = '1px solid #E5E5E7';
            selectedBox.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
            selectedBox = null;
        }
    });

    // Add this inside your DOMContentLoaded event listener, near the other keyboard event listeners
    document.addEventListener('keydown', function(e) {
        // Check for Ctrl+X (or Cmd+X on Mac)
        if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
            e.preventDefault(); // Prevent default cut behavior
            
            // Remove all connections
            connections.forEach(conn => {
                conn.line.remove();
            });
            connections = [];
            
            // Remove all boxes
            const boxes = document.querySelectorAll('.thought-box');
            boxes.forEach(box => box.remove());
            
            // Reset selected box if any
            selectedBox = null;
        }
    });

    // Update the SVG definitions to be more visible
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    defs.style.position = 'absolute';
    defs.style.width = '0';
    defs.style.height = '0';
    defs.innerHTML = `
        <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" 
                refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#1D1D1F"/>
            </marker>
        </defs>
    `;
    document.body.appendChild(defs);

    // Update the tutorial text to include both deletion features
    const tutorialSteps = document.querySelector('.tutorial-steps');
    const deleteSteps = document.createElement('div');
    deleteSteps.className = 'step';
    deleteSteps.innerHTML = `
        <h3>5. Deleting</h3>
        <p>• Right-click on any connection line to delete it</p>
        <p>• Press Ctrl+X (or Cmd+X) to clear the entire board</p>
    `;
    tutorialSteps.appendChild(deleteSteps);

    // Add some CSS for the connection hover effect
    const style = document.createElement('style');
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

    // Move generateToDoList inside DOMContentLoaded
    function generateToDoList() {
        const boxes = Array.from(document.querySelectorAll('.thought-box'));
        const taskMap = new Map();
        const incomingConnections = new Map();

        // Initialize maps
        boxes.forEach(box => {
            taskMap.set(box, []);
            incomingConnections.set(box, 0);
        });

        // Build connection graph
        connections.forEach(conn => {
            taskMap.get(conn.start).push(conn.end);
            incomingConnections.set(conn.end, (incomingConnections.get(conn.end) || 0) + 1);
        });

        // Find main tasks (not marked as subtasks)
        const mainTasks = boxes.filter(box => 
            box.getAttribute('data-is-subtask') !== 'true'
        );

        // Generate the todo list HTML
        const todoListContainer = document.getElementById('todo-list-container');
        todoListContainer.innerHTML = '';
        const todoList = document.createElement('ul');
        todoList.className = 'todo-list';

        // Process each main task
        mainTasks.forEach((task, index) => {
            buildTaskHierarchy(task, 0, `${index + 1}`);
        });

        function buildTaskHierarchy(task, level = 0, taskNumber = '') {
            const text = task.querySelector('textarea').value.trim() || 'Untitled Task';
            const listItem = document.createElement('li');
            const isSubtask = task.getAttribute('data-is-subtask') === 'true';
            
            listItem.className = `todo-item ${isSubtask ? 'subtask' : 'main-task'}`;
            
            const connectedTasks = taskMap.get(task) || [];
            const connectedSubtasks = connectedTasks.filter(t => 
                t.getAttribute('data-is-subtask') === 'true'
            );
            
            listItem.innerHTML = `
                <div class="todo-checkbox"></div>
                <div class="todo-text-container">
                    <div class="todo-text">
                        ${text}
                        ${!isSubtask ? `<span class="task-number">${taskNumber}</span>` : ''}
                    </div>
                    ${connectedSubtasks.length > 0 ? `
                        <div class="subtask-count">
                            ${connectedSubtasks.length} subtask${connectedSubtasks.length > 1 ? 's' : ''}
                        </div>
                    ` : ''}
                </div>
            `;

            const checkbox = listItem.querySelector('.todo-checkbox');
            checkbox.addEventListener('click', () => {
                checkbox.classList.toggle('checked');
                listItem.classList.toggle('completed');
                
                // If this is a main task, toggle all connected subtasks
                if (!isSubtask && connectedSubtasks.length > 0) {
                    const isCompleted = checkbox.classList.contains('checked');
                    connectedSubtasks.forEach(subtask => {
                        const subtaskCheckbox = subtask.querySelector('.todo-checkbox');
                        subtaskCheckbox.classList.toggle('checked', isCompleted);
                        subtask.classList.toggle('completed', isCompleted);
                    });
                }
            });

            // Add data attribute to link subtasks to their parent
            if (taskNumber) {
                listItem.setAttribute('data-parent', taskNumber);
            }

            todoList.appendChild(listItem);

            // Process connected subtasks
            if (connectedSubtasks.length > 0) {
                connectedSubtasks.forEach(subtask => {
                    buildTaskHierarchy(subtask, level + 1);
                });
            }
        }

        todoListContainer.appendChild(todoList);
        
        // Show the modal
        const todoModal = document.getElementById('todo-modal');
        todoModal.style.display = 'flex';
    }

    // Add event listeners for the todo list modal
    const generateListButton = document.getElementById('generate-list-button');
    const todoModal = document.getElementById('todo-modal');
    const closeTodoButton = document.getElementById('close-todo-button');

    generateListButton.addEventListener('click', generateToDoList);

    closeTodoButton.addEventListener('click', () => {
        todoModal.style.display = 'none';
    });

    todoModal.addEventListener('click', function(e) {
        if (e.target === todoModal) {
            todoModal.style.display = 'none';
        }
    });

    function handleConnection(e, box) {
        if (!selectedBox) {
            selectedBox = box;
            box.style.border = '2px solid #000000';
            box.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
        } else if (selectedBox !== box) {
            createConnection(selectedBox, box);
            selectedBox.style.border = '1px solid #E5E5E7';
            selectedBox.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
            selectedBox = null;
        } else {
            // Deselect if clicking the same box
            selectedBox.style.border = '1px solid #E5E5E7';
            selectedBox.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
            selectedBox = null;
        }
    }

    function handleLongPress(e, box) {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        const isSubtask = box.getAttribute('data-is-subtask') === 'true';
        
        menu.innerHTML = `
            <div class="context-menu-item">
                ${isSubtask ? 'Convert to Main Task' : 'Convert to Subtask'}
            </div>
        `;
        
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        document.body.appendChild(menu);
        
        // Show menu with animation
        requestAnimationFrame(() => menu.classList.add('active'));
        
        // Handle menu item click
        menu.querySelector('.context-menu-item').addEventListener('click', () => {
            toggleSubtask(box);
            menu.remove();
        });
        
        // Hide menu when clicking outside
        function hideMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('mousedown', hideMenu);
            }
        }
        document.addEventListener('mousedown', hideMenu);
    }

    function toggleSubtask(box) {
        const isSubtask = box.getAttribute('data-is-subtask') === 'true';
        box.setAttribute('data-is-subtask', (!isSubtask).toString());
        
        // Toggle class without transitions
        if (!isSubtask) {
            box.classList.add('subtask');
            // Adjust size immediately
            const rect = box.getBoundingClientRect();
            box.style.width = (rect.width * 0.7) + 'px';
            box.style.height = (rect.height * 0.7) + 'px';
        } else {
            box.classList.remove('subtask');
            // Reset size
            box.style.width = '';
            box.style.height = '';
        }
        
        // Update connections immediately
        connections.forEach(conn => {
            if (conn.start === box || conn.end === box) {
                updateConnection(conn);
            }
        });
    }
}); 