#!/usr/bin/env node

/**
 * Regression tests for add_todo + heading (Bug 3)
 *
 * Headings cannot be created or read via the Things AppleScript bridge, so
 * to-dos with a `heading` are created through the Things URL scheme, which
 * places the to-do under the heading when it exists and at the project's top
 * level when it doesn't (Things ignores unknown headings). Because the bridge
 * can't verify which happened, the response always carries a `note` caveat
 * ("place + caveat" behaviour).
 *
 * Requires Things 3 running; skips cleanly in CI. To fully exercise 3a, create
 * a heading named "Verification Heading" in the test project manually first.
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

suite.test('add_todo with a heading succeeds and returns a caveat note (3a)', async () => {
  if (!await ThingsTestHelper.isRunning() || !projectId) {
    console.log('⏭️  Skipping - Things 3 not running or setup failed');
    return;
  }

  const parsed = runScript('add_todo', {
    name: 'V3a - under heading',
    list_id: projectId,
    heading: HEADING_NAME
  });

  expect.toEqual(parsed.success, true);
  expect.toHaveProperty(parsed.data, 'note');
  expect.toContain(parsed.data.note, HEADING_NAME);
  console.log('   ℹ️  Manually confirm in Things whether the to-do landed under ' +
    `the "${HEADING_NAME}" heading (only if you created that heading).`);
});

suite.test('add_todo with a non-existent heading still creates the to-do (no error) (3b)', async () => {
  if (!await ThingsTestHelper.isRunning() || !projectId) {
    console.log('⏭️  Skipping - Things 3 not running or setup failed');
    return;
  }

  // Per the chosen "place + caveat" behaviour, a missing heading is not an error:
  // the to-do is created at the project's top level and the note flags the caveat.
  const parsed = runScript('add_todo', {
    name: 'V3b - missing heading',
    list_id: projectId,
    heading: 'ThisHeadingDoesNotExist'
  });

  expect.toEqual(parsed.success, true);
  expect.toHaveProperty(parsed.data, 'note');
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
