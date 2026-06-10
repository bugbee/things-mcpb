#!/usr/bin/env node

/**
 * Unit tests for list/heading resolution helpers (jxa/src/utils.js)
 *
 * These cover the root cause of Bug 1 (add_todo + list_id) and the heading
 * lookup used by Bug 3, using an in-memory mock of the Things app so they run
 * in CI without macOS or Things 3.
 */

import { TestSuite, expect } from '../test-utils.js';
import { resolveTargetList, resolveHeading } from '../../jxa/src/utils.js';
import { createMockThings, createContainer, createHeading } from '../mocks/things-mock.js';

const suite = new TestSuite('List/Heading Resolution Unit Tests');

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

suite.test('resolveHeading finds an existing heading in a project', () => {
  const heading = createHeading('Section A');
  const project = createContainer({ id: 'proj-1', name: 'P', headings: [heading] });

  const result = resolveHeading(project, 'Section A');
  expect.toBeTruthy(result);
  expect.toEqual(result.name(), 'Section A');
});

suite.test('resolveHeading returns null for a missing heading', () => {
  const heading = createHeading('Section A');
  const project = createContainer({ id: 'proj-1', name: 'P', headings: [heading] });

  expect.toEqual(resolveHeading(project, 'Nonexistent'), null);
});

suite.test('resolveHeading returns null when container has no headings (area)', () => {
  const area = createContainer({ id: 'area-1', name: 'A', type: 'area' });
  expect.toEqual(resolveHeading(area, 'Anything'), null);
});

suite.test('resolveHeading returns null for null inputs', () => {
  expect.toEqual(resolveHeading(null, 'x'), null);
  const project = createContainer({ id: 'p', name: 'P' });
  expect.toEqual(resolveHeading(project, null), null);
});

suite.run().catch(() => process.exit(1));
