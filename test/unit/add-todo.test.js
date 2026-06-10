#!/usr/bin/env node

/**
 * Unit tests for TodoOperations.add / update (jxa/src/todos.js)
 *
 * Exercises the actual operation logic against an in-memory Things mock, so the
 * three add_todo bug fixes are verified in CI without macOS or Things 3:
 *   - Bug 1: add_todo + list_id targets the right project (no execution error)
 *   - Bug 2: add_todo + checklist_items creates real checklist items
 *   - Bug 3: add_todo + heading places the todo / errors clearly when missing
 */

import { TestSuite, expect } from '../test-utils.js';
import { TodoOperations } from '../../jxa/src/todos.js';
import { createMockThings, createContainer, createHeading } from '../mocks/things-mock.js';

const suite = new TestSuite('add_todo / update_todo Unit Tests');

// ---------------------------------------------------------------------------
// Bug 1: list_id
// ---------------------------------------------------------------------------

suite.test('Bug 1: add_todo with list_id places the todo in the target project', () => {
  const project = createContainer({ id: '31cyKhCZU1arpagS6RMb31', name: 'Test MCP' });
  const things = createMockThings({ projects: [project] });

  const result = TodoOperations.add(things, {
    name: 'Test todo',
    notes: 'Any notes',
    list_id: '31cyKhCZU1arpagS6RMb31'
  });

  // Todo landed in the project, not the inbox
  expect.toHaveLength(project.toDos.items, 1);
  expect.toHaveLength(things.toDos.items, 0);
  expect.toEqual(project.toDos.items[0].name(), 'Test todo');
  expect.toEqual(result.name, 'Test todo');
});

suite.test('Bug 1: add_todo with list_id does not throw (regression guard)', () => {
  const project = createContainer({ id: 'proj-x', name: 'X' });
  const things = createMockThings({ projects: [project] });

  // The original bug raised a generic execution error here.
  TodoOperations.add(things, { name: 'No throw', list_id: 'proj-x' });
  expect.toHaveLength(project.toDos.items, 1);
});

suite.test('add_todo with no list falls back to the inbox', () => {
  const things = createMockThings({});
  TodoOperations.add(things, { name: 'Inbox todo' });
  expect.toHaveLength(things.toDos.items, 1);
});

// ---------------------------------------------------------------------------
// Bug 2: checklist_items (write path)
// ---------------------------------------------------------------------------

suite.test('Bug 2: add_todo with checklist_items creates checklist items', () => {
  const things = createMockThings({});

  const result = TodoOperations.add(things, {
    name: 'Has checklist',
    checklist_items: ['Sub-item one', 'Sub-item two', 'Sub-item three']
  });

  const todo = things.toDos.items[0];
  const items = todo.checklistItems();
  expect.toHaveLength(items, 3);
  expect.toEqual(items[0].name(), 'Sub-item one');
  expect.toEqual(items[1].name(), 'Sub-item two');
  expect.toEqual(items[2].name(), 'Sub-item three');

  // Read path (issue #22): mapped response includes the checklist items
  expect.toHaveLength(result.checklistItems, 3);
  expect.toEqual(result.checklistItems[0].name, 'Sub-item one');
  expect.toEqual(result.checklistItems[0].completed, false);
});

suite.test('Bug 2: add_todo without checklist_items yields an empty checklist', () => {
  const things = createMockThings({});
  const result = TodoOperations.add(things, { name: 'No checklist' });
  expect.toHaveLength(result.checklistItems, 0);
});

suite.test('Bug 2: checklist_items applied alongside tags, deadline and when', () => {
  const project = createContainer({ id: 'p1', name: 'Test MCP' });
  const things = createMockThings({ projects: [project] });

  const result = TodoOperations.add(things, {
    name: 'Test 4 - kitchen sink',
    notes: 'Testing all the optional params at once',
    list_title: 'Test MCP',
    checklist_items: ['Sub-item one', 'Sub-item two', 'Sub-item three'],
    tags: ['testing', 'mcp'],
    due_date: '2026-06-30',
    activation_date: '2026-06-15'
  });

  expect.toHaveLength(result.checklistItems, 3);
  expect.toDeepEqual(result.tags, ['testing', 'mcp']);
  expect.toBeTruthy(result.deadline);          // due date applied
  expect.toHaveLength(project.toDos.items, 1); // landed in the project
});

// ---------------------------------------------------------------------------
// Bug 3: heading
// ---------------------------------------------------------------------------

suite.test('Bug 3: add_todo with an existing heading places the todo under it', () => {
  const heading = createHeading('Section A - Headings Test');
  const project = createContainer({ id: 'p1', name: 'Test MCP', headings: [heading] });
  const things = createMockThings({ projects: [project] });

  TodoOperations.add(things, {
    name: 'Test 6 - heading parameter',
    list_title: 'Test MCP',
    heading: 'Section A - Headings Test'
  });

  // Todo is placed under the heading, not at the project's top level
  expect.toHaveLength(heading.toDos.items, 1);
  expect.toHaveLength(project.toDos.items, 0);
  expect.toEqual(heading.toDos.items[0].name(), 'Test 6 - heading parameter');
});

suite.test('Bug 3: add_todo with a missing heading throws and creates no todo', () => {
  const project = createContainer({ id: 'p1', name: 'Test MCP', headings: [] });
  const things = createMockThings({ projects: [project] });

  expect.toThrow(() => {
    TodoOperations.add(things, {
      name: 'V3b - should error',
      list_title: 'Test MCP',
      heading: 'ThisHeadingDoesNotExist'
    });
  }, /not found/);

  // No orphan todo anywhere
  expect.toHaveLength(project.toDos.items, 0);
  expect.toHaveLength(things.toDos.items, 0);
});

suite.test('Bug 3: add_todo with a heading but no target project throws', () => {
  const things = createMockThings({});

  expect.toThrow(() => {
    TodoOperations.add(things, {
      name: 'No project',
      heading: 'Some Heading'
    });
  }, /no target/);

  expect.toHaveLength(things.toDos.items, 0);
});

// ---------------------------------------------------------------------------
// update_todo checklist handling
// ---------------------------------------------------------------------------

suite.test('update_todo replaces checklist items', () => {
  const things = createMockThings({});
  // Seed a todo with one existing checklist item
  const created = TodoOperations.add(things, {
    name: 'Seeded',
    checklist_items: ['old item']
  });

  const result = TodoOperations.update(things, {
    id: created.id,
    checklist_items: ['new one', 'new two']
  });

  expect.toHaveLength(result.checklistItems, 2);
  expect.toEqual(result.checklistItems[0].name, 'new one');
  expect.toEqual(result.checklistItems[1].name, 'new two');
});

suite.test('update_todo with empty checklist_items clears all items', () => {
  const things = createMockThings({});
  const created = TodoOperations.add(things, {
    name: 'Seeded',
    checklist_items: ['a', 'b']
  });

  const result = TodoOperations.update(things, {
    id: created.id,
    checklist_items: []
  });

  expect.toHaveLength(result.checklistItems, 0);
});

suite.run().catch(() => process.exit(1));
