#!/usr/bin/env node

/**
 * Unit tests for TodoOperations.add / update (jxa/src/todos.js)
 *
 * Exercises the operation logic against an in-memory Things mock (and a mock
 * JXA host `Application` for the URL-scheme path), so the add_todo fixes are
 * verified in CI without macOS or Things 3:
 *   - Bug 1: add_todo + list_id targets the right project via the object model.
 *   - Bug 2: add_todo + checklist_items routes through the Things URL scheme
 *            (the only way to create checklists) and echoes the created items.
 *   - Bug 3: add_todo + heading routes through the URL scheme and returns a
 *            "place + caveat" note (headings can't be validated via the bridge).
 */

import { TestSuite, expect } from '../test-utils.js';
import { TodoOperations } from '../../jxa/src/todos.js';
import {
  createMockThings,
  createContainer,
  createTodo as createMockTodo,
  installMockApplication
} from '../mocks/things-mock.js';

const suite = new TestSuite('add_todo / update_todo Unit Tests');

/**
 * Wire a mock host Application whose openLocation simulates Things creating the
 * to-do: it adds a new mock to-do (named from the URL's title) into `scope`.
 */
function withSimulatedThings(scopeContainer, fn) {
  const host = installMockApplication((url) => {
    const m = /[?&]title=([^&]*)/.exec(url);
    const title = m ? decodeURIComponent(m[1]) : '';
    scopeContainer.toDos.push(createMockTodo({ name: title }));
  });
  try {
    return fn(host);
  } finally {
    host.restore();
  }
}

// ---------------------------------------------------------------------------
// Bug 1: list_id (object-model path, unchanged)
// ---------------------------------------------------------------------------

suite.test('Bug 1: add_todo with list_id places the todo in the target project', () => {
  const project = createContainer({ id: '31cyKhCZU1arpagS6RMb31', name: 'Test MCP' });
  const things = createMockThings({ projects: [project] });

  const result = TodoOperations.add(things, {
    name: 'Test todo',
    notes: 'Any notes',
    list_id: '31cyKhCZU1arpagS6RMb31'
  });

  expect.toHaveLength(project.toDos.items, 1);
  expect.toEqual(project.toDos.items[0].name(), 'Test todo');
  expect.toEqual(result.name, 'Test todo');
});

suite.test('add_todo with no list and no checklist/heading uses the inbox (object model)', () => {
  const things = createMockThings({});
  // No Application installed - if this path tried the URL scheme it would throw.
  TodoOperations.add(things, { name: 'Inbox todo' });
  expect.toHaveLength(things.toDos.items, 1);
});

// ---------------------------------------------------------------------------
// Bug 2: checklist_items (URL-scheme path)
// ---------------------------------------------------------------------------

suite.test('Bug 2: add_todo with checklist_items uses the URL scheme and echoes items', () => {
  const project = createContainer({ id: 'p1', name: 'Test MCP' });
  const things = createMockThings({ projects: [project] });

  withSimulatedThings(project, (host) => {
    const result = TodoOperations.add(things, {
      name: 'Has checklist',
      list_title: 'Test MCP',
      checklist_items: ['Sub-item one', 'Sub-item two', 'Sub-item three']
    });

    // The URL scheme was used, with checklist-items encoded in the URL
    expect.toHaveLength(host.opened, 1);
    expect.toContain(host.opened[0], 'things:///add?');
    expect.toContain(host.opened[0], 'checklist-items=');

    // The created todo is found and its checklist echoed back
    expect.toEqual(result.name, 'Has checklist');
    expect.toHaveLength(result.checklistItems, 3);
    expect.toEqual(result.checklistItems[0].name, 'Sub-item one');
    expect.toEqual(result.checklistItems[0].completed, false);
  });
});

suite.test('Bug 2: empty checklist_items array stays on the object-model path', () => {
  const things = createMockThings({});
  // No Application installed; empty array must NOT route to the URL scheme.
  const result = TodoOperations.add(things, { name: 'No checklist', checklist_items: [] });
  expect.toHaveLength(things.toDos.items, 1);
  expect.toHaveLength(result.checklistItems, 0);
});

suite.test('Bug 2: checklist add does not leave an orphan when creation succeeds', () => {
  const project = createContainer({ id: 'p1', name: 'P' });
  const things = createMockThings({ projects: [project] });

  withSimulatedThings(project, () => {
    TodoOperations.add(things, {
      name: 'Single',
      list_id: 'p1',
      checklist_items: ['only one']
    });
    // Exactly one todo created (atomic), not a duplicate/orphan
    expect.toHaveLength(project.toDos.items, 1);
  });
});

// ---------------------------------------------------------------------------
// Bug 3: heading (URL-scheme path, place + caveat)
// ---------------------------------------------------------------------------

suite.test('Bug 3: add_todo with heading uses the URL scheme and returns a caveat note', () => {
  const project = createContainer({ id: 'p1', name: 'Test MCP' });
  const things = createMockThings({ projects: [project] });

  withSimulatedThings(project, (host) => {
    const result = TodoOperations.add(things, {
      name: 'Under heading',
      list_title: 'Test MCP',
      heading: 'Section A'
    });

    expect.toHaveLength(host.opened, 1);
    expect.toContain(host.opened[0], 'heading=Section%20A');
    expect.toHaveProperty(result, 'note');
    expect.toContain(result.note, 'Section A');
  });
});

suite.test('Bug 3: heading without a target project notes it was ignored', () => {
  const things = createMockThings({});
  const inbox = things.lists.byId('TMInboxListSource');

  withSimulatedThings(inbox, (host) => {
    const result = TodoOperations.add(things, {
      name: 'No project',
      heading: 'Some Heading'
    });
    expect.toHaveLength(host.opened, 1);
    expect.toHaveProperty(result, 'note');
    expect.toContain(result.note, 'ignored');
  });
});

// ---------------------------------------------------------------------------
// update_todo checklist handling (no auth-token flow -> clear note)
// ---------------------------------------------------------------------------

suite.test('update_todo with checklist_items returns a note and does not throw', () => {
  const existing = createMockTodo({ id: 't1', name: 'Existing' });
  const things = createMockThings({});
  things.toDos.push(existing);

  const result = TodoOperations.update(things, {
    id: 't1',
    notes: 'updated notes',
    checklist_items: ['a', 'b']
  });

  expect.toEqual(result.notes, 'updated notes'); // other fields still applied
  expect.toHaveProperty(result, 'note');
  expect.toContain(result.note, 'auth-token');
});

suite.run().catch(() => process.exit(1));
