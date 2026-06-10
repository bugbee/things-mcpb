#!/usr/bin/env node

/**
 * Regression tests for add_todo + list_id (Bug 1)
 *
 * add_todo with a project's list_id must place the todo inside that project
 * without an execution error. The old code used things.lists.byId() (built-in
 * lists only), which failed for project IDs.
 *
 * Requires Things 3 running; skips cleanly in CI.
 */

import { TestSuite, expect, ThingsTestHelper } from '../test-utils.js';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import path from 'path';

const suite = new TestSuite('add_todo list_id Regression Tests (Bug 1)');

function runScript(operation, params) {
  const scriptPath = path.join(process.cwd(), 'jxa', 'build', `${operation}.js`);
  const tempParamsFile = '/tmp/test-listid-params.json';
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

let projectId = null;
let todoId = null;

suite.test('setup: create a target project', async () => {
  if (!await ThingsTestHelper.isRunning()) {
    console.log('⏭️  Skipping - Things 3 not running');
    return;
  }
  const parsed = runScript('add_project', {
    name: 'List ID Regression Project',
    notes: 'Temporary project for Bug 1 regression test'
  });
  expect.toEqual(parsed.success, true);
  projectId = parsed.data.id;
});

suite.test('add_todo with list_id lands the todo in the target project', async () => {
  if (!await ThingsTestHelper.isRunning() || !projectId) {
    console.log('⏭️  Skipping - Things 3 not running or setup failed');
    return;
  }

  const parsed = runScript('add_todo', {
    name: 'V1 - list_id should work',
    notes: 'If this lands in the project, bug 1 is fixed',
    list_id: projectId
  });

  expect.toEqual(parsed.success, true);
  expect.toHaveProperty(parsed.data, 'id');
  expect.toBeTruthy(parsed.data.project, 'todo should report a parent project');
  expect.toEqual(parsed.data.project.id, projectId);
  todoId = parsed.data.id;
});

suite.test('cleanup: remove regression project', async () => {
  if (!await ThingsTestHelper.isRunning() || !projectId) {
    console.log('⏭️  No cleanup needed');
    return;
  }
  try {
    await ThingsTestHelper.executeJXA(`
      function run(argv) {
        try {
          const params = JSON.parse(argv[0] || '{}');
          const things = Application('com.culturedcode.ThingsMac');
          things.delete(things.projects.byId(params.id));
          return JSON.stringify({ success: true });
        } catch (error) {
          return JSON.stringify({ success: false, error: { message: error.message } });
        }
      }
    `, { id: projectId });
  } catch (e) {
    console.log('⚠️  Cleanup failed:', e.message);
  }
});

suite.run().catch(() => process.exit(1));
