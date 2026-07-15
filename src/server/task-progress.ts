/**
 * Task-progress counting. Pure functions over file contents: they never read disk or the
 * binary, so progress can be recomputed from already-loaded task markdown. This is the only
 * source for archived changes, which never appear in `list --json`, and it costs nothing extra
 * for the change detail view, which loads every task file to render it anyway. For active
 * changes, `list --json`'s count is authoritative; the two may still be compared, but this
 * module makes each individually correct and reconciles neither.
 */

/** The completed and total checkbox counts for one or more task files. */
export interface Progress {
  completed: number;
  total: number;
}

/**
 * Any markdown task checkbox, with optional leading indentation and any GFM list marker
 * (`-`, `*` or `+`): `- [ ]`, `* [x]`, `+ [X]`, and so on.
 */
const CHECKBOX = /^\s*[-*+] \[[ xX]\]/;

/** A *checked* checkbox: `[x]` or `[X]`, under any list marker. */
const CHECKED = /^\s*[-*+] \[[xX]\]/;

/**
 * Counts checkbox lines in one file's contents. A `[x]`/`[X]` line counts as complete, a
 * `[ ]` line as incomplete, and every non-checkbox line — heading, prose, plain bullet — is
 * ignored. Leading whitespace is allowed, so a checkbox nested under a parent bullet counts.
 */
export function countCheckboxes(content: string): Progress {
  let completed = 0;
  let total = 0;

  for (const line of content.split(/\r?\n/)) {
    if (!CHECKBOX.test(line)) continue;
    total += 1;
    if (CHECKED.test(line)) completed += 1;
  }

  return { completed, total };
}

/**
 * Sums checkbox counts across all of a change's task files into one combined pair, so a
 * schema that splits tasks across several files yields a single progress number. With no
 * task files, the total is zero.
 */
export function aggregateProgress(contents: string[]): Progress {
  return contents.reduce<Progress>(
    (accumulator, content) => {
      const { completed, total } = countCheckboxes(content);
      return { completed: accumulator.completed + completed, total: accumulator.total + total };
    },
    { completed: 0, total: 0 },
  );
}
