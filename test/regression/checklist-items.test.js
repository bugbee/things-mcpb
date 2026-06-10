#!/usr/bin/env node

/**
 * Regression tests for checklist items (Issues #11 / #22)
 *
 * Write path: add_todo with checklist_items must create real Things checklist
 * items (previously dropped silently).
 * Read path: get_todos / the mapped to-do response must include checklistItems
 * (issue #22 - "checklistItems not returned").
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
  expect.toHaveProperty(parsed.data, 'checklistItems');
  expect.toHaveLength(parsed.data.checklistItems, 3);
  expect.toEqual(parsed.data.checklistItems[0].name, 'First sub-item');
  expect.toEqual(parsed.data.checklistItems[1].name, 'Second sub-item');
  expect.toEqual(parsed.data.checklistItems[2].name, 'Third sub-item');
  parsed.data.checklistItems.forEach(item => {
    expect.toEqual(item.completed, false);
  });

  createdTodoId = parsed.data.id;
});

suite.test('get_todos returns checklist items (read path, issue #22)', async () => {
  if (!await ThingsTestHelper.isRunning() || !createdTodoId) {
    console.log('⏭️  Skipping - Things 3 not running or setup failed');
    return;
  }

  const parsed = runScript('get_todos', { include_items: true });
  expect.toEqual(parsed.success, true);

  const todo = parsed.data.find(t => t.id === createdTodoId);
  expect.toBeTruthy(todo, 'created todo should be returned');
  expect.toHaveProperty(todo, 'checklistItems');
  expect.toHaveLength(todo.checklistItems, 3);
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
