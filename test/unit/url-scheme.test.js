#!/usr/bin/env node

/**
 * Unit tests for the Things URL builder (jxa/src/url-scheme.js)
 *
 * Verifies that add_todo's URL-scheme path constructs a correct, properly
 * encoded `things:///add` URL for checklist items, headings, targeting and
 * other properties.
 */

import { TestSuite, expect } from '../test-utils.js';
import { buildAddUrl } from '../../jxa/src/url-scheme.js';

const suite = new TestSuite('Things URL Builder Unit Tests');

suite.test('builds a basic add URL with an encoded title', () => {
  const url = buildAddUrl({ name: 'Buy milk & eggs' });
  expect.toContain(url, 'things:///add?');
  expect.toContain(url, 'title=Buy%20milk%20%26%20eggs');
});

suite.test('encodes checklist-items as newline-separated values', () => {
  const url = buildAddUrl({ name: 'T', checklist_items: ['one', 'two', 'three'] });
  // Newlines between items are encoded as %0A
  expect.toContain(url, 'checklist-items=one%0Atwo%0Athree');
});

suite.test('includes list-id when provided', () => {
  const url = buildAddUrl({ name: 'T', list_id: '31cyKhCZU1arpagS6RMb31' });
  expect.toContain(url, 'list-id=31cyKhCZU1arpagS6RMb31');
});

suite.test('uses list (name) when only list_title is provided', () => {
  const url = buildAddUrl({ name: 'T', list_title: 'Test MCP' });
  expect.toContain(url, 'list=Test%20MCP');
  expect.toBeFalsy(url.includes('list-id='));
});

suite.test('prefers list-id over list_title', () => {
  const url = buildAddUrl({ name: 'T', list_id: 'abc', list_title: 'Test MCP' });
  expect.toContain(url, 'list-id=abc');
  expect.toBeFalsy(url.includes('list=Test'));
});

suite.test('includes an encoded heading', () => {
  const url = buildAddUrl({ name: 'T', list_id: 'abc', heading: 'Section A - Test' });
  expect.toContain(url, 'heading=Section%20A%20-%20Test');
});

suite.test('omits optional params that are absent', () => {
  const url = buildAddUrl({ name: 'Just a title' });
  expect.toBeFalsy(url.includes('checklist-items='));
  expect.toBeFalsy(url.includes('heading='));
  expect.toBeFalsy(url.includes('notes='));
  expect.toBeFalsy(url.includes('list='));
  expect.toBeFalsy(url.includes('list-id='));
});

suite.test('includes notes when provided', () => {
  const url = buildAddUrl({ name: 'T', notes: 'some notes' });
  expect.toContain(url, 'notes=some%20notes');
});

suite.run().catch(() => process.exit(1));
