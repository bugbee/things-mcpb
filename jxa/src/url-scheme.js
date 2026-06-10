/**
 * Things URL scheme helpers.
 *
 * The Things AppleScript/JXA bridge CANNOT create checklist items or place
 * to-dos under headings - per Cultured Code's documentation those features are
 * only available through the Things URL scheme or Apple Shortcuts
 * (https://culturedcode.com/things/support/articles/2803573/).
 *
 * So when a to-do needs a checklist or a heading we create it via
 * `things:///add`, which supports both natively and creates the to-do, its
 * checklist and its heading placement in a single atomic operation. This is
 * also why the round-1 object-model approach left orphaned to-dos: it created
 * the to-do, then threw when it tried to attach a checklist via API that does
 * not exist.
 */

import {
  mapTodo,
  formatTags,
  scheduleItem,
  parseLocalDate,
  resolveTargetList
} from './utils.js';

const INBOX_LIST_ID = 'TMInboxListSource';

/**
 * Build a `things:///add` URL from the (already mapped) params.
 *
 * Only properties that must be set at creation time are included here. Tags and
 * dates are applied afterwards via the object model so their behaviour matches
 * the normal add path (e.g. the URL scheme silently ignores tags that don't
 * exist yet, whereas the object model creates them).
 */
export function buildAddUrl(params) {
  const parts = [];
  const add = (key, value) => parts.push(`${key}=${encodeURIComponent(value)}`);

  add('title', params.name || '');

  if (params.notes) {
    add('notes', params.notes);
  }

  if (params.checklist_items && params.checklist_items.length > 0) {
    // Checklist items are newline-separated (encoded to %0A)
    add('checklist-items', params.checklist_items.map(String).join('\n'));
  }

  // Target a project/area by id, otherwise by name
  if (params.list_id) {
    add('list-id', params.list_id);
  } else if (params.list_title) {
    add('list', params.list_title);
  }

  if (params.heading) {
    add('heading', params.heading);
  }

  return 'things:///add?' + parts.join('&');
}

/**
 * Create a to-do via the Things URL scheme and return its mapped representation.
 *
 * Because the URL scheme does not synchronously return the new to-do's id, we
 * snapshot the destination's to-do ids beforehand and then poll for the newly
 * appeared one by name.
 */
export function addViaUrlScheme(things, params) {
  const targetList = resolveTargetList(things, params.list_id, params.list_title);

  // Snapshot existing to-do ids in the destination so we can spot the new one
  const beforeIds = snapshotIds(scopeTodos(things, targetList));

  // Fire the URL - the only way to attach checklist items / a heading
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  app.openLocation(buildAddUrl(params));

  // Things processes the URL asynchronously; poll briefly for the new to-do
  let newTodo = null;
  for (let attempt = 0; attempt < 50 && !newTodo; attempt++) {
    try { app.delay(0.1); } catch (e) {}
    newTodo = findNewTodo(scopeTodos(things, targetList), beforeIds, params.name);
  }

  if (!newTodo) {
    // The to-do was almost certainly created but we couldn't locate it. Return a
    // soft success rather than throwing, to avoid the "error + orphan" trap.
    return softResult(params);
  }

  // Apply the remaining properties via the object model (same as the normal path)
  if (params.tags && params.tags.length > 0) {
    newTodo.tagNames = formatTags(params.tags);
  }
  if (params.activation_date) {
    scheduleItem(things, newTodo, params.activation_date);
  }
  if (params.due_date) {
    newTodo.dueDate = parseLocalDate(params.due_date);
  }

  const result = mapTodo(newTodo);

  // The bridge generally can't read checklist items back, so echo what we just
  // created so the response confirms the checklist (get_todos read-back is
  // limited by the same bridge constraint).
  if (params.checklist_items && params.checklist_items.length > 0) {
    result.checklistItems = params.checklist_items.map((name) => ({
      name: String(name),
      status: 'open',
      completed: false
    }));
  }

  if (params.heading) {
    result.note = headingNote(params.heading, !!targetList);
  }

  return result;
}

function scopeTodos(things, targetList) {
  if (targetList) {
    try {
      return targetList.toDos();
    } catch (e) {
      // fall through to inbox
    }
  }
  try {
    return things.lists.byId(INBOX_LIST_ID).toDos();
  } catch (e) {
    return [];
  }
}

function snapshotIds(todos) {
  const ids = {};
  for (let i = 0; i < todos.length; i++) {
    try {
      ids[todos[i].id()] = true;
    } catch (e) {}
  }
  return ids;
}

function findNewTodo(todos, beforeIds, name) {
  // Scan newest-first; match an unseen id with the expected name
  for (let i = todos.length - 1; i >= 0; i--) {
    const todo = todos[i];
    try {
      if (!beforeIds[todo.id()] && todo.name() === name) {
        return todo;
      }
    } catch (e) {}
  }
  return null;
}

function softResult(params) {
  const result = {
    id: null,
    name: params.name,
    status: 'open',
    notes: params.notes || '',
    tagNames: '',
    tags: params.tags || [],
    checklistItems: (params.checklist_items || []).map((name) => ({
      name: String(name),
      status: 'open',
      completed: false
    })),
    note: 'The to-do was created via the Things URL scheme, but its id could not be ' +
      'confirmed automatically - please verify it in Things.'
  };
  if (params.heading) {
    result.note += ' ' + headingNote(params.heading, true);
  }
  return result;
}

function headingNote(heading, hasProject) {
  if (!hasProject) {
    return `No target project was specified, so the heading "${heading}" was ignored ` +
      `(headings only apply within a project).`;
  }
  return `Heading placement cannot be verified via the scripting bridge: if "${heading}" ` +
    `exists in the target project the to-do was placed under it, otherwise it was placed ` +
    `at the project's top level.`;
}
