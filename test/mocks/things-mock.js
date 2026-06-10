/**
 * In-memory mock of the Things 3 JXA application object.
 *
 * The real Things app is only available on macOS with Things 3 running, so
 * these mocks let us exercise the JXA operation logic (todos.js, utils.js) in
 * plain Node for CI. They reproduce the two quirks of the JXA object bridge
 * that the production code depends on:
 *
 *   1. Properties are dual-natured: `todo.name` returns a function you call
 *      (`todo.name()`), but `todo.name = 'x'` assigns a new value. `dualProp`
 *      models this with a getter that returns an accessor function and a setter
 *      that stores the value.
 *   2. `collection.byId(id)` returns a lazy specifier that only throws when it
 *      is accessed - so a missing object returns an object whose `.id()` throws.
 */

let idCounter = 0;

/**
 * Define a JXA-style dual-natured property: readable via `obj.key()` and
 * writable via `obj.key = value`.
 */
function dualProp(obj, key, initial) {
  let value = initial;
  Object.defineProperty(obj, key, {
    configurable: true,
    get() {
      return () => value;
    },
    set(v) {
      value = v;
    }
  });
}

/**
 * Build a callable collection: `coll()` returns a snapshot array and
 * `coll.push(item)` appends. The backing array is exposed as `coll.items`.
 */
function makeCollection() {
  const items = [];
  const coll = () => items.slice();
  coll.items = items;
  coll.push = (item) => {
    item.__arr = items;
    items.push(item);
  };
  return coll;
}

export function createChecklistItem(name) {
  const item = {};
  dualProp(item, 'name', name);
  dualProp(item, 'status', 'open');
  return item;
}

export function createTodo(props = {}) {
  const todo = {};
  const id = props.id || `todo-${idCounter++}`;

  todo.id = () => id;
  dualProp(todo, 'name', props.name || '');
  dualProp(todo, 'notes', props.notes || '');
  dualProp(todo, 'status', props.status || 'open');
  dualProp(todo, 'tagNames', '');
  dualProp(todo, 'dueDate', null);
  dualProp(todo, 'activationDate', null);
  dualProp(todo, 'creationDate', null);
  dualProp(todo, 'modificationDate', null);
  dualProp(todo, 'completionDate', null);
  dualProp(todo, 'cancellationDate', null);
  dualProp(todo, 'project', null);
  dualProp(todo, 'area', null);

  todo.checklistItems = makeCollection();
  return todo;
}

export function createHeading(name) {
  const heading = {};
  dualProp(heading, 'name', name);
  heading.toDos = makeCollection();
  return heading;
}

/**
 * Create a project/area container with `toDos` and `headings` elements.
 */
export function createContainer({ id, name, type = 'project', headings = [] } = {}) {
  const container = {};
  const cid = id || `${type}-${idCounter++}`;

  container.id = () => cid;
  dualProp(container, 'name', name || '');
  dualProp(container, 'status', 'open');
  container.type = type;

  container.toDos = makeCollection();

  // Only projects expose headings in Things; areas throw if asked.
  if (type === 'project') {
    container.headings = () => headings.slice();
  } else {
    container.headings = () => {
      throw new Error('Areas do not have headings');
    };
  }

  return container;
}

function makeByIdAccessor(collection) {
  return (id) => {
    const found = collection.find((obj) => obj.id() === id);
    if (found) return found;
    // Mimic a JXA lazy specifier that only throws when accessed.
    return {
      id: () => {
        throw new Error(`Object not found: ${id}`);
      }
    };
  };
}

export function createMockThings({ projects = [], areas = [], lists = [] } = {}) {
  const things = {};

  // Ensure a built-in Inbox list exists (used as the default URL-scheme scope)
  if (!lists.some((l) => l.id() === 'TMInboxListSource')) {
    lists = [createContainer({ id: 'TMInboxListSource', name: 'Inbox', type: 'list' }), ...lists];
  }

  things.ToDo = (props) => createTodo(props);
  things.ChecklistItem = (props) => createChecklistItem(props.name);

  const projectsFn = () => projects.slice();
  projectsFn.byId = makeByIdAccessor(projects);
  things.projects = projectsFn;

  const areasFn = () => areas.slice();
  areasFn.byId = makeByIdAccessor(areas);
  things.areas = areasFn;

  const listsFn = () => lists.slice();
  listsFn.byId = makeByIdAccessor(lists);
  things.lists = listsFn;

  // Inbox collection
  things.toDos = makeCollection();
  const todosByIdAccessor = makeByIdAccessor(things.toDos.items);
  things.toDos.byId = todosByIdAccessor;

  things.schedule = (item, opts) => {
    item.__scheduled = opts.for;
  };
  things.move = (item, opts) => {
    item.__movedTo = opts.to;
  };
  things.delete = (item) => {
    if (item && item.__arr) {
      const idx = item.__arr.indexOf(item);
      if (idx >= 0) item.__arr.splice(idx, 1);
    }
  };

  return things;
}

/**
 * Install a mock JXA host `Application` global so url-scheme.js can run under
 * Node. `openLocation` simulates Things processing a `things:///add` URL by
 * invoking `onOpenLocation(url)` (which the test wires up to create a to-do in
 * the mock), and `delay` is a no-op. Returns a teardown function and a record
 * of the URLs that were opened.
 */
export function installMockApplication(onOpenLocation) {
  const opened = [];
  const prevApplication = globalThis.Application;

  const hostApp = {
    includeStandardAdditions: false,
    openLocation(url) {
      opened.push(url);
      if (onOpenLocation) onOpenLocation(url);
    },
    delay() {}
  };

  const ApplicationMock = function () { return hostApp; };
  ApplicationMock.currentApplication = () => hostApp;

  globalThis.Application = ApplicationMock;

  return {
    opened,
    restore() {
      globalThis.Application = prevApplication;
    }
  };
}

export default {
  createMockThings,
  createContainer,
  createHeading,
  createTodo,
  createChecklistItem,
  installMockApplication
};
