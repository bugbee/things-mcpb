/**
 * Todo operations for Things 3
 */

import {
  mapTodo,
  formatTags,
  scheduleItem,
  parseLocalDate,
  resolveTargetList,
  resolveHeading,
  addChecklistItems,
  setChecklistItems
} from './utils.js';

export class TodoOperations {

  /**
   * Add a new todo
   */
  static add(things, params) {
    // Resolve the target container (project, area, or built-in list).
    // Handles `list_id` (Bug 1) and `list_title`.
    const targetList = resolveTargetList(things, params.list_id, params.list_title);

    // If a heading was requested, resolve it BEFORE creating the to-do so that
    // a missing heading fails loudly without leaving an orphan to-do behind
    // (Bug 3 - previously this silently succeeded with no heading placement).
    let headingTarget = null;
    if (params.heading) {
      if (!targetList) {
        throw new Error(
          `Cannot place to-do under heading "${params.heading}": no target ` +
          `project was found. Specify the project via list_id or list_title.`
        );
      }
      headingTarget = resolveHeading(targetList, params.heading);
      if (!headingTarget) {
        throw new Error(
          `Heading "${params.heading}" was not found in the target project. ` +
          `Create the heading in Things first, then add to-dos under it.`
        );
      }
    }

    // Create the todo
    const todoProps = {
      name: params.name
    };

    if (params.notes) {
      todoProps.notes = params.notes;
    }

    const todo = things.ToDo(todoProps);

    // Add todo to appropriate location
    if (headingTarget) {
      headingTarget.toDos.push(todo);
    } else if (targetList) {
      targetList.toDos.push(todo);
    } else {
      // Only add to general todos (inbox) if no specific list/project
      things.toDos.push(todo);
    }

    // Set tags (convert array to comma-separated string)
    if (params.tags && params.tags.length > 0) {
      todo.tagNames = formatTags(params.tags);
    }

    // Schedule activation date (when to work on)
    if (params.activation_date) {
      scheduleItem(things, todo, params.activation_date);
    }

    // Set due date (when actually due)
    if (params.due_date) {
      todo.dueDate = parseLocalDate(params.due_date);
    }

    // Create checklist items (Bug 2 - previously dropped silently)
    addChecklistItems(things, todo, params.checklist_items);

    return mapTodo(todo);
  }
  
  /**
   * Update an existing todo
   */
  static update(things, params) {
    // Try to find the item as either a todo or a project
    let todo = null;
    let isProject = false;
    
    try {
      todo = things.toDos.byId(params.id);
    } catch (e) {
      try {
        todo = things.projects.byId(params.id);
        isProject = true;
      } catch (e2) {
        throw new Error(`Todo/Project with id ${params.id} not found`);
      }
    }
    
    // Update basic properties
    if (params.name !== undefined) {
      todo.name = params.name;
    }
    
    if (params.notes !== undefined) {
      todo.notes = params.notes;
    }
    
    // Update tags - empty array means remove all tags
    if (params.tags !== undefined) {
      todo.tagNames = formatTags(params.tags);
    }
    
    // Update status
    if (params.completed === true) {
      todo.status = 'completed';
    } else if (params.canceled === true) {
      todo.status = 'canceled';
    }
    
    // Update dates
    if (params.activation_date !== undefined) {
      if (params.activation_date) {
        scheduleItem(things, todo, params.activation_date);
      } else {
        // Clear activation date by scheduling to far future then back
        try {
          scheduleItem(things, todo, '2099-12-31');
          things.schedule(todo, { for: null });
        } catch (e) {
          // Schedule clearing failed
        }
      }
    }
    
    if (params.due_date !== undefined) {
      todo.dueDate = params.due_date ? parseLocalDate(params.due_date) : null;
    }

    // Replace checklist items (empty array clears them). Projects do not have
    // checklist items, so only apply this to plain to-dos.
    if (params.checklist_items !== undefined && !isProject) {
      setChecklistItems(things, todo, params.checklist_items);
    }

    return mapTodo(todo);
  }
  
  /**
   * Get all todos, optionally filtered by project
   */
  static getAll(things, params) {
    let todos;
    
    if (params.project_uuid) {
      try {
        const project = things.projects.byId(params.project_uuid);
        todos = project.toDos();
      } catch (e) {
        return [];
      }
    } else {
      todos = things.toDos();
    }
    
    const includeItems = params.include_items !== false; // default true
    
    if (includeItems) {
      return todos.map(mapTodo);
    } else {
      // Just return basic info
      return todos.map(todo => ({
        id: todo.id(),
        name: todo.name(),
        status: todo.status()
      }));
    }
  }
}
