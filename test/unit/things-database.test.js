#!/usr/bin/env node

/**
 * Unit tests for the Things SQLite read layer (server/things-database.js)
 *
 * Covers the #22 read-path fix: since JXA cannot read checklist items, the
 * server reads them from Things' SQLite database and enriches the response.
 * These tests inject fake DB access so they run in CI without macOS or Things.
 */

import { TestSuite, expect } from '../test-utils.js';
import {
  mapChecklistStatus,
  isValidTaskId,
  buildChecklistQuery,
  collectChecklistTargets,
  groupRows,
  getChecklistItemsByTask,
  enrichChecklists
} from '../../server/things-database.js';

const suite = new TestSuite('Things Database (checklist read) Unit Tests');

// --- status mapping ---------------------------------------------------------

suite.test('maps status integers to strings', () => {
  expect.toEqual(mapChecklistStatus(0), 'open');
  expect.toEqual(mapChecklistStatus(2), 'canceled');
  expect.toEqual(mapChecklistStatus(3), 'completed');
  expect.toEqual(mapChecklistStatus(99), 'open'); // unknown -> open
});

// --- id validation (SQL-injection guard) ------------------------------------

suite.test('accepts alphanumeric task ids and rejects unsafe ones', () => {
  expect.toBeTruthy(isValidTaskId('Hp6LQ3sD9CSqDVuniVfJh6'));
  expect.toBeFalsy(isValidTaskId("a'; DROP TABLE TMChecklistItem;--"));
  expect.toBeFalsy(isValidTaskId('has space'));
  expect.toBeFalsy(isValidTaskId(''));
  expect.toBeFalsy(isValidTaskId(null));
});

// --- query building ---------------------------------------------------------

suite.test('builds an IN query ordered by index', () => {
  const sql = buildChecklistQuery(['a1', 'b2']);
  expect.toContain(sql, "FROM TMChecklistItem");
  expect.toContain(sql, "WHERE task IN ('a1','b2')");
  expect.toContain(sql, 'ORDER BY task, "index"');
});

// --- target collection ------------------------------------------------------

suite.test('collects to-dos with a checklistItems field, including nested', () => {
  const data = [
    { id: 't1', checklistItems: [] },
    { id: 't2', name: 'no field' },                // skipped (no checklistItems)
    { id: 'p1', todos: [{ id: 't3', checklistItems: [] }] } // nested
  ];
  const targets = collectChecklistTargets(data);
  const ids = targets.map((t) => t.id).sort();
  expect.toDeepEqual(ids, ['t1', 't3']);
});

suite.test('ignores objects without a string id', () => {
  const targets = collectChecklistTargets({ id: 123, checklistItems: [] });
  expect.toHaveLength(targets, 0);
});

// --- row grouping -----------------------------------------------------------

suite.test('groups rows by task and shapes items like add_todo', () => {
  const rows = [
    { task: 't1', title: 'First', status: 0 },
    { task: 't1', title: 'Second', status: 3 },
    { task: 't2', title: 'Other', status: 0 }
  ];
  const map = groupRows(rows);
  expect.toHaveLength(map.t1, 2);
  expect.toDeepEqual(map.t1[0], { name: 'First', status: 'open', completed: false });
  expect.toDeepEqual(map.t1[1], { name: 'Second', status: 'completed', completed: true });
  expect.toHaveLength(map.t2, 1);
});

// --- getChecklistItemsByTask with injected deps -----------------------------

suite.test('getChecklistItemsByTask filters invalid ids and queries valid ones', async () => {
  let queriedIds = null;
  const map = await getChecklistItemsByTask(['good1', "bad'id"], {
    findDatabasePath: () => '/fake/main.sqlite',
    queryChecklistRows: async (dbPath, ids) => {
      queriedIds = ids;
      return [{ task: 'good1', title: 'X', status: 0 }];
    }
  });
  expect.toDeepEqual(queriedIds, ['good1']); // unsafe id filtered out
  expect.toHaveLength(map.good1, 1);
});

suite.test('getChecklistItemsByTask returns {} when database is missing', async () => {
  const map = await getChecklistItemsByTask(['good1'], {
    findDatabasePath: () => null,
    queryChecklistRows: async () => { throw new Error('should not run'); }
  });
  expect.toDeepEqual(map, {});
});

suite.test('getChecklistItemsByTask is fail-soft on query errors', async () => {
  const map = await getChecklistItemsByTask(['good1'], {
    findDatabasePath: () => '/fake/main.sqlite',
    queryChecklistRows: async () => { throw new Error('sqlite3 not found'); }
  });
  expect.toDeepEqual(map, {});
});

// --- enrichChecklists (the read-path fix, #22) ------------------------------

suite.test('enrichChecklists populates checklistItems from the database', async () => {
  const data = [
    { id: 'Hp6LQ3sD9CSqDVuniVfJh6', name: 'R2-V2', checklistItems: [] },
    { id: 'noChecklist', name: 'R2-V1', checklistItems: [] }
  ];

  await enrichChecklists(data, {
    findDatabasePath: () => '/fake/main.sqlite',
    queryChecklistRows: async () => [
      { task: 'Hp6LQ3sD9CSqDVuniVfJh6', title: 'First sub-item', status: 0 },
      { task: 'Hp6LQ3sD9CSqDVuniVfJh6', title: 'Second sub-item', status: 0 },
      { task: 'Hp6LQ3sD9CSqDVuniVfJh6', title: 'Third sub-item', status: 0 }
    ]
  });

  expect.toHaveLength(data[0].checklistItems, 3);
  expect.toEqual(data[0].checklistItems[0].name, 'First sub-item');
  expect.toEqual(data[0].checklistItems[0].status, 'open');
  expect.toEqual(data[0].checklistItems[0].completed, false);
  // Regression: a to-do with no checklist stays empty (empty when nothing)
  expect.toHaveLength(data[1].checklistItems, 0);
});

suite.test('enrichChecklists preserves an existing echo when DB has nothing', async () => {
  // Mirrors add_todo's just-created to-do: echoed items, DB not yet populated
  const data = { id: 'new1', checklistItems: [{ name: 'echoed', status: 'open', completed: false }] };

  await enrichChecklists(data, {
    findDatabasePath: () => '/fake/main.sqlite',
    queryChecklistRows: async () => [] // DB returns nothing for this id yet
  });

  expect.toHaveLength(data.checklistItems, 1);
  expect.toEqual(data.checklistItems[0].name, 'echoed');
});

suite.test('enrichChecklists no-ops on results without to-dos', async () => {
  const data = [{ id: 'tag1', name: 'work' }]; // tags: no checklistItems field
  const out = await enrichChecklists(data, {
    findDatabasePath: () => { throw new Error('should not be called'); }
  });
  expect.toDeepEqual(out, [{ id: 'tag1', name: 'work' }]);
});

suite.run().catch(() => process.exit(1));
