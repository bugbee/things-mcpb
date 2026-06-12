#!/usr/bin/env node

/**
 * Test Runner for Things MCPB
 *
 * Comprehensive test suite covering:
 * - MCP server functionality
 * - JXA script execution
 * - Things 3 API integration
 * - Known issues from GitHub
 * - Data handling and edge cases
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const TEST_FILES = [
  // Unit tests (no Things 3 required)
  'unit/parameter-processor.test.js',
  'unit/input-validator.test.js',
  'unit/date-handling.test.js',
  'unit/tag-formatting.test.js',
  'unit/list-ids.test.js',
  'unit/list-resolution.test.js',
  'unit/add-todo.test.js',
  'unit/url-scheme.test.js',
  'unit/things-database.test.js',
  
  // Build system tests
  'unit/build-system.test.js',
  'unit/script-bundling.test.js',
  
  // MCP server tests
  'unit/mcp-server.test.js',
  'unit/tool-definitions.test.js',
  
  // JXA execution tests (mock)
  'unit/jxa-executor.test.js',
  
  // Integration tests (require Things 3)
  'integration/things-connection.test.js',
  'integration/list-operations.test.js',
  'integration/todo-operations.test.js',
  'integration/project-operations.test.js',
  'integration/area-operations.test.js',
  'integration/tag-operations.test.js',
  'integration/search-operations.test.js',
  
  // GitHub issue regression tests
  'regression/tag-removal.test.js',        // Issue #3
  'regression/project-todos.test.js',      // Issue #5
  'regression/apostrophes.test.js',        // Issue #7
  'regression/area-assignment.test.js',    // Issue #8
  'regression/checklist-items.test.js',    // Issue #11
  'regression/list-ids.test.js',          // Recent fix
];

async function runTests() {
  console.log('🧪 Things MCPB Test Suite');
  console.log('=========================\n');
  
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  
  // Check if Things 3 is running for integration tests
  const thingsRunning = await checkThingsRunning();
  if (!thingsRunning) {
    console.log('⚠️  Things 3 not running - integration tests will be skipped\n');
  }
  
  for (const testFile of TEST_FILES) {
    const testPath = path.join('test', testFile);
    const isIntegration = testFile.startsWith('integration/');
    
    if (!existsSync(testPath)) {
      console.log(`⏭️  SKIP: ${testFile} (file not found)`);
      skipped++;
      continue;
    }
    
    if (isIntegration && !thingsRunning) {
      console.log(`⏭️  SKIP: ${testFile} (Things 3 not running)`);
      skipped++;
      continue;
    }
    
    try {
      console.log(`🔍 Running ${testFile}...`);
      execSync(`node ${testPath}`, { 
        stdio: 'pipe',
        cwd: process.cwd()
      });
      console.log(`✅ PASS: ${testFile}`);
      passed++;
    } catch (error) {
      console.log(`❌ FAIL: ${testFile}`);
      console.log(`   Error: ${error.message}\n`);
      failed++;
    }
  }
  
  console.log('\n📊 Test Results');
  console.log('===============');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`📋 Total: ${TEST_FILES.length}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

async function checkThingsRunning() {
  try {
    execSync('osascript -l JavaScript -e "Application(\\"com.culturedcode.ThingsMac\\").running()"', { 
      stdio: 'pipe' 
    });
    return true;
  } catch {
    return false;
  }
}

runTests().catch(console.error);