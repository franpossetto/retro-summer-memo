/**
 * JSON Patch (RFC 6902) over plain JSON values, returning a new value.
 *
 * Extension: a path segment `[id=<value>]` selects the array element whose `id` equals <value>,
 * e.g. `/applications/[id=abc]/company`. Assistants edit by id without counting positions, and
 * an id that no longer exists fails loudly instead of hitting whatever moved into that index.
 */

export type PatchOperation =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string }
  | { op: 'copy'; from: string; path: string }
  | { op: 'test'; path: string; value: unknown }

export class PatchError extends Error {}

type Container = Record<string, unknown> | unknown[]

export function applyPatch<T>(document: T, operations: PatchOperation[]): T {
  let root: unknown = structuredClone(document)
  operations.forEach((operation, index) => {
    try {
      root = applyOperation(root, operation)
    } catch (error) {
      const where = 'from' in operation ? `${operation.from} → ${operation.path}` : operation.path
      throw new PatchError(`Operation ${index + 1} (${operation.op} ${where}): ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  return root as T
}

function applyOperation(root: unknown, operation: PatchOperation): unknown {
  switch (operation.op) {
    case 'add':
      return add(root, operation.path, structuredClone(operation.value))
    case 'remove':
      return remove(root, operation.path).root
    case 'replace': {
      if (operation.path === '') return structuredClone(operation.value)
      const { parent, key } = locate(root, operation.path, false)
      read(parent, key) // must exist
      write(parent, key, structuredClone(operation.value))
      return root
    }
    case 'move': {
      if (operation.path.startsWith(`${operation.from}/`)) throw new Error('cannot move a value into itself')
      const { root: without, value } = remove(root, operation.from)
      return add(without, operation.path, value)
    }
    case 'copy':
      return add(root, operation.path, structuredClone(get(root, operation.from)))
    case 'test':
      if (!deepEqual(get(root, operation.path), operation.value)) throw new Error('test failed: value differs')
      return root
    default:
      throw new Error(`unknown op "${(operation as { op: string }).op}"`)
  }
}

export function get(root: unknown, path: string): unknown {
  if (path === '') return root
  const { parent, key } = locate(root, path, false)
  return read(parent, key)
}

function add(root: unknown, path: string, value: unknown): unknown {
  if (path === '') return value
  const { parent, key } = locate(root, path, true)
  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : arrayIndex(parent, key, true)
    parent.splice(index, 0, value)
  } else {
    parent[key] = value
  }
  return root
}

function remove(root: unknown, path: string): { root: unknown; value: unknown } {
  if (path === '') throw new Error('cannot remove the whole document')
  const { parent, key } = locate(root, path, false)
  const value = read(parent, key)
  if (Array.isArray(parent)) parent.splice(arrayIndex(parent, key, false), 1)
  else delete parent[key]
  return { root, value }
}

/** The container holding the last segment of `path`, and that segment resolved to a key. */
function locate(root: unknown, path: string, forAdd: boolean): { parent: Container; key: string } {
  const segments = parsePointer(path)
  let current: unknown = root
  for (const segment of segments.slice(0, -1)) {
    if (!isContainer(current)) throw new Error(`"${segment}" is inside a value that is not an object or array`)
    current = read(current, resolve(current, segment))
  }
  if (!isContainer(current)) throw new Error('the parent is not an object or array')
  const last = segments[segments.length - 1]
  const key = last === '-' && Array.isArray(current) && forAdd ? '-' : resolve(current, last)
  return { parent: current, key }
}

function resolve(container: Container, segment: string): string {
  const byId = /^\[id=(.*)\]$/.exec(segment)
  if (!byId) return segment
  if (!Array.isArray(container)) throw new Error(`${segment} only works on arrays`)
  const index = container.findIndex((item) => isRecord(item) && String(item.id) === byId[1])
  if (index < 0) throw new Error(`no element with id "${byId[1]}"`)
  return String(index)
}

function read(container: Container, key: string): unknown {
  if (Array.isArray(container)) return container[arrayIndex(container, key, false)]
  if (!Object.prototype.hasOwnProperty.call(container, key)) throw new Error(`"${key}" does not exist`)
  return container[key]
}

function write(container: Container, key: string, value: unknown) {
  if (Array.isArray(container)) container[arrayIndex(container, key, false)] = value
  else container[key] = value
}

function arrayIndex(array: unknown[], key: string, forAdd: boolean): number {
  if (!/^(0|[1-9]\d*)$/.test(key)) throw new Error(`"${key}" is not an array index`)
  const index = Number(key)
  if (index > array.length || (!forAdd && index === array.length)) throw new Error(`index ${index} is out of range (length ${array.length})`)
  return index
}

function parsePointer(path: string): string[] {
  if (!path.startsWith('/')) throw new Error('paths start with "/"')
  return path
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
