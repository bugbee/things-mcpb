# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **`add_todo` with `list_id` no longer fails** — `list_id` is now resolved against
  projects, areas, and built-in lists (previously it used the built-in-lists-only
  accessor, so a project ID produced a generic execution error).
- **`add_todo` with `checklist_items` now creates real checklist items** — they
  were silently dropped before (the parameter was remapped to an unused internal
  key). Checklist items are now created as Things "checklist item" objects.
- **`add_todo` with `heading` now behaves predictably** — to-dos are placed under
  an existing heading in the target project, and a missing heading returns a clear
  error instead of silently succeeding with no placement (and no orphan to-do is
  left behind). Headings still cannot be created via the scripting bridge.

### Added
- Checklist items are now included in the mapped to-do response (`checklistItems`),
  fixing the read path from issue #22 (`get_todos` now returns checklist items).
- `update_todo` with `checklist_items` replaces a to-do's checklist items
  (empty array clears them).
- Unit tests covering list/heading resolution and the full `add_todo`/`update_todo`
  flow via an in-memory Things mock, plus live-Things regression tests for each fix.

## [1.5.2] - 2025-01-05

### Changed
- **MAJOR IMPROVEMENT**: Reduced package size from 12MB to 4.2MB (65% reduction)
- Optimized package script to exclude devDependencies (esbuild, @esbuild, @anthropic-ai/mcpb) from bundle
- Faster installation and reduced disk space usage

## [1.5.1] - 2025-01-05

### Fixed
- **CRITICAL**: Reverted manifest schema from 0.3 back to 0.2 for Claude Desktop compatibility
- Claude Desktop v1.0.211 only supports manifest version 0.2 (0.3 support coming in future release)

## [1.5.0] - 2025-01-05

### Added
- Tool metadata annotations (`readOnlyHint`, `destructiveHint`) for MCP Directory compliance
- All 21 tools now properly annotated with behavior hints

### Changed
- **BREAKING**: Upgraded manifest schema from 0.2 to 0.3
- Updated to latest `@anthropic-ai/mcpb` package (2.0.1)
- Updated all npm dependencies to latest versions

### Fixed
- Improved tool metadata for better MCP client integration

## [1.4.1] - 2024-10-27

### Fixed
- Various bug fixes and improvements

## [1.4.0] - 2024-10-27

### Added
- Enhanced JXA script architecture
- Improved error handling and validation

## [1.0.0] - 2024-11-08

### Added
- Initial release
- Things 3 integration via JXA
- 21 tools for complete task management
- Support for todos, projects, areas, and tags
