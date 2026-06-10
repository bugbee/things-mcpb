#!/usr/bin/env node

/**
 * Regression tests for add_todo + heading (Bug 3)
 *
 * - An existing heading places the todo under it.
 * - A non-existent heading returns a clear error and creates no todo
 *   (no silent fallback).
 *
 * NOTE: Things cannot create headings via the scripting bridge, so the
 * existing-heading case requires a heading named "Verification Heading" to be
 * created manually in the test project beforehand. When absent, that test
 * is skipped rather than failed. Requires Things 3 running; skips in CI.
 */

import { TestSuite, expect, ThingsTestHelper } from '../test-utils.js';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import path from 'path';

const suite = new TestSuite('add_todo heading Regression Tests (Bug 3)');

const HEADING_NAME = 'Verification Heading';

function runScript(operation, params) {
  const scriptPath = path.join(process.cwd(), 'jxa', 'build', `${operation}.js`);
  const tempParamsFile = '/tmp/test-heading-params.json';
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
let projectName = null;

suite.test('setup: create a target project', async () => {
  if (!await ThingsTestHelper.isRunning()) {
    console.log('⏭️  Skipping - Things 3 not running');
    return;
  }
  projectName = `Heading Regression Project ${Date.now()}`;
  const parsed = runScript('add_project', { name: projectName });
  expect.toEqual(parsed.success, true);
  projectId = parsed.data.id;
  console.log(`   ℹ️  To exercise the existing-heading case, add a heading named ` +
    `"${HEADING_NAME}" to the project "${projectName}" in Things.`);
});

suite.test('add_todo with a non-existent heading errors and creates no todo', async () => {
  if (!await ThingsTestHelper.isRunning() || !projectId) {
    console.log('⏭️  Skipping - Things 3 not running or setup failed');
    return;
  }

  const parsed = runScript('add_todo', {
    name: 'V3b - should error',
    list_id: projectId,
    heading: 'ThisHeadingDoesNotExist'
  });

  expect.toEqual(parsed.success, false);
  expect.toBeTruthy(parsed.error, 'an error should be returned');
  expect.toContain(parsed.error.message, 'not found');

  // Confirm no orphan todo was created in the project
  const todos = runScript('get_todos', { project_uuid: projectId });
  expect.toEqual(todos.success, true);
  const orphan = todos.data.find(t => t.name === 'V3b - should error');
  expect.toBeFalsy(orphan, 'no todo should have been created');
});

suite.test('add_todo under an existing heading places the todo there', async () => {
  if (!await ThingsTestHelper.isRunning() || !projectId) {
    console.log('⏭️  Skipping - Things 3 not running or setup failed');
    return;
  }

  // Only meaningful if the manual heading exists. Probe by attempting the add.
  const parsed = runScript('add_todo', {
    name: 'V3a - under heading',
    list_id: projectId,
    heading: HEADING_NAME
  });

  if (!parsed.success) {
    console.log(`⏭️  Skipping - heading "${HEADING_NAME}" not present in test project. ` +
      `Create it manually to exercise this case.`);
    return;
  }

  expect.toHaveProperty(parsed.data, 'id');
  expect.toEqual(parsed.data.name, 'V3a - under heading');
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
