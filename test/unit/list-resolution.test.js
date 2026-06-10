#!/usr/bin/env node

/**
 * Unit tests for list resolution (jxa/src/utils.js)
 *
 * Covers the root cause of Bug 1 (add_todo + list_id) using an in-memory mock
 * of the Things app so they run in CI without macOS or Things 3.
 */

import { TestSuite, expect } from '../test-utils.js';
import { resolveTargetList } from '../../jxa/src/utils.js';
import { createMockThings, createContainer } from '../mocks/things-mock.js';

const suite = new TestSuite('List Resolution Unit Tests');

suite.test('resolveTargetList resolves a project by id', () => {
  const project = createContainer({ id: 'proj-123', name: 'My Project' });
  const things = createMockThings({ projects: [project] });

  const result = resolveTargetList(things, 'proj-123', undefined);
  expect.toBeTruthy(result);
  expect.toEqual(result.id(), 'proj-123');
});

suite.test('resolveTargetList resolves an area by id', () => {
  const area = createContainer({ id: 'area-9', name: 'Work', type: 'area' });
  const things = createMockThings({ areas: [area] });

  const result = resolveTargetList(things, 'area-9', undefined);
  expect.toBeTruthy(result);
  expect.toEqual(result.id(), 'area-9');
});

suite.test('resolveTargetList resolves a built-in list by id', () => {
  const list = createContainer({ id: 'TMTodayListSource', name: 'Today', type: 'list' });
  const things = createMockThings({ lists: [list] });

  const result = resolveTargetList(things, 'TMTodayListSource', undefined);
  expect.toBeTruthy(result);
  expect.toEqual(result.id(), 'TMTodayListSource');
});

suite.test('resolveTargetList returns null for an unknown id (no throw)', () => {
  const project = createContainer({ id: 'proj-123', name: 'My Project' });
  const things = createMockThings({ projects: [project] });

  const result = resolveTargetList(things, 'does-not-exist', undefined);
  expect.toEqual(result, null);
});

suite.test('resolveTargetList resolves a project by title', () => {
  const project = createContainer({ id: 'proj-123', name: 'My Project' });
  const things = createMockThings({ projects: [project] });

  const result = resolveTargetList(things, undefined, 'My Project');
  expect.toBeTruthy(result);
  expect.toEqual(result.id(), 'proj-123');
});

suite.test('resolveTargetList prefers project over area when both match a title', () => {
  const project = createContainer({ id: 'proj-1', name: 'Shared Name' });
  const area = createContainer({ id: 'area-1', name: 'Shared Name', type: 'area' });
  const things = createMockThings({ projects: [project], areas: [area] });

  const result = resolveTargetList(things, undefined, 'Shared Name');
  expect.toEqual(result.id(), 'proj-1');
});

suite.test('resolveTargetList returns null when neither id nor title provided', () => {
  const things = createMockThings({});
  expect.toEqual(resolveTargetList(things, undefined, undefined), null);
});

suite.run().catch(() => process.exit(1));
