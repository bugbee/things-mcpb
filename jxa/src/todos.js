/**
 * Todo operations for Things 3
 */

import {
  mapTodo,
  formatTags,
  scheduleItem,
  parseLocalDate,
  resolveTargetList
} from './utils.js';
import { addViaUrlScheme } from './url-scheme.js';

export class TodoOperations {

  /**
   * Add a new todo
   */
  static add(things, params) {
    // Checklist items and headings cannot be created through the AppleScript/JXA
    // bridge - only via the Things URL scheme. Route those cases there so the
    // to-do + checklist + heading are created atomically (no orphan to-dos).
    const needsUrlScheme =
      (params.checklist_items && params.checklist_items.length > 0) || !!params.heading;

    if (needsUrlScheme) {
      return addViaUrlScheme(things, params);
    }

    // Object-model path - handles list_id targeting (Bug 1) and plain to-dos.
    const targetList = resolveTargetList(things, params.list_id, params.list_title);

    const todoProps = {
      name: params.name
    };

    if (params.notes) {
      todoProps.notes = params.notes;
    }

    const todo = things.ToDo(todoProps);

    // Add todo to appropriate location
    if (targetList) {
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

    const result = mapTodo(todo);

    // Editing checklist items on an existing to-do requires the URL-scheme
    // `update` command, which needs a Things auth token (not configured). Rather
    // than silently failing or throwing after other fields were already updated,
    // surface a clear note. The other field updates above still apply.
    if (params.checklist_items !== undefined) {
      result.note = 'Checklist items were not modified: editing checklists on an ' +
        'existing to-do requires the Things URL auth-token flow, which is not enabled ' +
        'in this extension. To set a checklist, create the to-do with add_todo.';
    }

    return result;
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
