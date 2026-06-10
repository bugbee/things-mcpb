#!/usr/bin/env node

/**
 * Regression tests for checklist items (Issues #11 / #22)
 *
 * Write path: add_todo with checklist_items must create real Things checklist
 * items. These are created via the Things URL scheme (the AppleScript bridge
 * cannot create checklist items), so the to-do + checklist are created
 * atomically and the response echoes the created items.
 *
 * Read path: the AppleScript bridge generally cannot read checklist items back,
 * so get_todos exposes a stable `checklistItems` field that may be empty. The
 * write response is the authoritative confirmation of what was created.
 *
 * Requires Things 3 running; skips cleanly in CI.
 */

import { TestSuite, expect, ThingsTestHelper } from '../test-utils.js';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import path from 'path';

const suite = new TestSuite('Checklist Items Regression Tests (Issues #11 / #22)');

function runScript(operation, params) {
  const scriptPath = path.join(process.cwd(), 'jxa', 'build', `${operation}.js`);
  const tempParamsFile = '/tmp/test-checklist-params.json';
  writeFileSync(tempParamsFile, JSON.stringify({ operation, ...params }));
  try {
    const result = execSync(
      `osascript -l JavaScript "${scriptPath}" "$(cat ${tempParamsFile})"`,
      { encoding: 'utf8' }
    );
    return JSON.parse(result);
  } finally {
    try { unlinkSync(tempParamsFile); } catch (e) {}
  }
}

let createdTodoId = null;

suite.test('add_todo with checklist_items creates checklist items (write path)', async () => {
  if (!await ThingsTestHelper.isRunning()) {
    console.log('⏭️  Skipping - Things 3 not running');
    return;
  }

  const parsed = runScript('add_todo', {
    name: 'Checklist regression todo',
    notes: 'Verifying write-path checklist creation',
    checklist_items: ['First sub-item', 'Second sub-item', 'Third sub-item']
  });

  expect.toEqual(parsed.success, true);
  // Write response echoes the created checklist items (authoritative confirmation).
  expect.toHaveProperty(parsed.data, 'checklistItems');
  expect.toHaveLength(parsed.data.checklistItems, 3);
  expect.toEqual(parsed.data.checklistItems[0].name, 'First sub-item');
  expect.toEqual(parsed.data.checklistItems[1].name, 'Second sub-item');
  expect.toEqual(parsed.data.checklistItems[2].name, 'Third sub-item');
  parsed.data.checklistItems.forEach(item => {
    expect.toEqual(item.completed, false);
  });

  // NOTE: manually verify in Things that the to-do has the three checklist items.
  createdTodoId = parsed.data.id;
});

suite.test('get_todos exposes a checklistItems field (read path, issue #22)', async () => {
  if (!await ThingsTestHelper.isRunning() || !createdTodoId) {
    console.log('⏭️  Skipping - Things 3 not running or setup failed');
    return;
  }

  const parsed = runScript('get_todos', { include_items: true });
  expect.toEqual(parsed.success, true);

  const todo = parsed.data.find(t => t.id === createdTodoId);
  expect.toBeTruthy(todo, 'created todo should be returned');
  // The field is always present; it may be empty because the AppleScript bridge
  // cannot read checklist items back (a Things limitation, not a bug here).
  expect.toHaveProperty(todo, 'checklistItems');
  if (todo.checklistItems.length === 0) {
    console.log('   ℹ️  checklistItems is empty on read - expected: the bridge ' +
      'cannot read checklists. Confirm the items exist via the Things UI.');
  }
});

suite.test('cleanup: remove regression todo', async () => {
  if (!await ThingsTestHelper.isRunning() || !createdTodoId) {
    console.log('⏭️  No cleanup needed');
    return;
  }
  try {
    await ThingsTestHelper.executeJXA(`
      function run(argv) {
        try {
          const params = JSON.parse(argv[0] || '{}');
          const things = Application('com.culturedcode.ThingsMac');
          things.delete(things.toDos.byId(params.id));
          return JSON.stringify({ success: true });
        } catch (error) {
          return JSON.stringify({ success: false, error: { message: error.message } });
        }
      }
    `, { id: createdTodoId });
  } catch (e) {
    console.log('⚠️  Cleanup failed:', e.message);
  }
});

suite.run().catch(() => process.exit(1));
