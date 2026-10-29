/**
 * Small, deterministic implementations of the data structures and
 * algorithms in the course, instrumented to count their steps. The labs
 * compare choices by actually running these, not by plugging numbers into
 * a formula.
 */

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Arrays and linked lists
// ---------------------------------------------------------------------------

export type Operation = { kind: "insert-front" | "append" | "read" | "remove-front"; at?: number };

/** Steps for a sequence of operations on an array of `size` items. */
export function arraySteps(size: number, operations: Operation[]): number {
  let n = size;
  let steps = 0;
  for (const op of operations) {
    if (op.kind === "insert-front") {
      steps += n + 1;
      n += 1;
    } else if (op.kind === "append") {
      steps += 1;
      n += 1;
    } else if (op.kind === "read") steps += 1;
    else {
      steps += n;
      n -= 1;
    }
  }
  return steps;
}

/** Steps for the same operations on a singly linked list with head and tail pointers. */
export function listSteps(size: number, operations: Operation[]): number {
  let n = size;
  let steps = 0;
  for (const op of operations) {
    if (op.kind === "insert-front" || op.kind === "append") {
      steps += 1;
      n += 1;
    } else if (op.kind === "read") steps += Math.min(op.at ?? 0, n - 1) + 1;
    else {
      steps += 1;
      n -= 1;
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Stacks and queues
// ---------------------------------------------------------------------------

/** Pushes every item, then takes them all out again. */
export function drain(items: string[], structure: "stack" | "queue"): string[] {
  return structure === "stack" ? [...items].reverse() : [...items];
}

// ---------------------------------------------------------------------------
// Hash tables
// ---------------------------------------------------------------------------

export type HashFunction = "last-digit" | "first-two" | "modulo";

export function bucketOf(key: number, fn: HashFunction, buckets: number): number {
  if (fn === "last-digit") return (key % 10) % buckets;
  if (fn === "first-two") return Number(String(key).slice(0, 2)) % buckets;
  return key % buckets;
}

export function distribute(keys: number[], fn: HashFunction, buckets: number): number[] {
  const counts = new Array<number>(buckets).fill(0);
  for (const key of keys) counts[bucketOf(key, fn, buckets)]! += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Sorting, with comparison counts and a stability check
// ---------------------------------------------------------------------------

export type Item = { key: number; tag: number };
export type SortName = "insertion" | "selection" | "merge" | "quick";
export type SortResult = { sorted: Item[]; comparisons: number };

function insertion(items: Item[]): SortResult {
  const a = [...items];
  let comparisons = 0;
  for (let i = 1; i < a.length; i += 1) {
    const current = a[i]!;
    let j = i - 1;
    while (j >= 0) {
      comparisons += 1;
      if (a[j]!.key <= current.key) break;
      a[j + 1] = a[j]!;
      j -= 1;
    }
    a[j + 1] = current;
  }
  return { sorted: a, comparisons };
}

function selection(items: Item[]): SortResult {
  const a = [...items];
  let comparisons = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    let min = i;
    for (let j = i + 1; j < a.length; j += 1) {
      comparisons += 1;
      if (a[j]!.key < a[min]!.key) min = j;
    }
    [a[i], a[min]] = [a[min]!, a[i]!];
  }
  return { sorted: a, comparisons };
}

function merge(items: Item[]): SortResult {
  let comparisons = 0;
  const sort = (a: Item[]): Item[] => {
    if (a.length <= 1) return a;
    const mid = Math.floor(a.length / 2);
    const left = sort(a.slice(0, mid));
    const right = sort(a.slice(mid));
    const out: Item[] = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      comparisons += 1;
      if (left[i]!.key <= right[j]!.key) out.push(left[i++]!);
      else out.push(right[j++]!);
    }
    return [...out, ...left.slice(i), ...right.slice(j)];
  };
  return { sorted: sort(items), comparisons };
}

/** Quicksort with the first element as pivot (Lomuto-style swaps), iterative so a bad case cannot blow the stack. */
function quick(items: Item[]): SortResult {
  const a = [...items];
  let comparisons = 0;
  const stack: [number, number][] = [[0, a.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (lo >= hi) continue;
    const pivot = a[lo]!;
    let store = lo;
    for (let i = lo + 1; i <= hi; i += 1) {
      comparisons += 1;
      if (a[i]!.key < pivot.key) {
        store += 1;
        [a[store], a[i]] = [a[i]!, a[store]!];
      }
    }
    [a[lo], a[store]] = [a[store]!, a[lo]!];
    stack.push([lo, store - 1], [store + 1, hi]);
  }
  return { sorted: a, comparisons };
}

export const SORTS: Record<SortName, (items: Item[]) => SortResult> = { insertion, selection, merge, quick };

/** True when items with equal keys kept their original order (tags ascend). */
export function isStable(sorted: Item[]): boolean {
  for (let i = 1; i < sorted.length; i += 1) if (sorted[i]!.key === sorted[i - 1]!.key && sorted[i]!.tag < sorted[i - 1]!.tag) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Grids and breadth-first search
// ---------------------------------------------------------------------------

export type Cell = [number, number];

export function neighbours(grid: string[], [x, y]: Cell): Cell[] {
  const out: Cell[] = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0]!.length && grid[ny]![nx] !== "#") out.push([nx, ny]);
  }
  return out;
}

/** Distance in steps from `start` to every reachable cell. */
export function bfs(grid: string[], start: Cell): Map<string, number> {
  const distance = new Map<string, number>([[start.join(","), 0]]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const cell = queue.shift()!;
    for (const next of neighbours(grid, cell)) {
      const key = next.join(",");
      if (distance.has(key)) continue;
      distance.set(key, distance.get(cell.join(","))! + 1);
      queue.push(next);
    }
  }
  return distance;
}

export function find(grid: string[], mark: string): Cell {
  for (let y = 0; y < grid.length; y += 1) {
    const x = grid[y]!.indexOf(mark);
    if (x >= 0) return [x, y];
  }
  throw new Error(`no ${mark} in grid`);
}
