import type { Heading, List, ListItem, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

/** The completed and total checkbox counts for one `## N.` task section. */
export interface TaskProgress {
  done: number;
  total: number;
}

const TASK_SECTION = /^\d+\.\s/;

function headingText(heading: Heading): string {
  let text = "";
  visit(heading, "text", (node) => {
    text += node.value;
  });
  return text;
}

function countCheckboxes(nodes: Root["children"], from: number, to: number): TaskProgress {
  let done = 0;
  let total = 0;

  for (let index = from; index < to; index += 1) {
    const node = nodes[index];
    if (node?.type !== "list") continue;
    visit(node as List, "listItem", (item: ListItem) => {
      if (typeof item.checked !== "boolean") return;
      total += 1;
      if (item.checked) done += 1;
    });
  }

  return { done, total };
}

/**
 * Annotates each `## N. …` heading with `{ done, total }` counted from the checkbox items
 * that follow it, up to the next `##` heading. Exposed as hast `data-*` properties (rather
 * than raw `data`) because that is what survives the mdast → hast conversion and reaches the
 * `h2` component override through its props. The rendered text is untouched — this is AST
 * annotation, not preprocessing.
 */
export const remarkTaskProgress: Plugin<[], Root> = () => (tree) => {
  const children = tree.children;

  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];
    if (node?.type !== "heading" || node.depth !== 2) continue;

    const heading = node as Heading;
    if (!TASK_SECTION.test(headingText(heading))) continue;

    let end = children.length;
    for (let next = index + 1; next < children.length; next += 1) {
      const candidate = children[next];
      if (candidate?.type === "heading" && candidate.depth === 2) {
        end = next;
        break;
      }
    }

    const { done, total } = countCheckboxes(children, index + 1, end);
    heading.data = {
      ...heading.data,
      hProperties: {
        ...(heading.data as { hProperties?: Record<string, unknown> } | undefined)?.hProperties,
        "data-task-done": done,
        "data-task-total": total,
      },
    };
  }
};
