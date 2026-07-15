import type { Heading } from "mdast";
import { visit } from "unist-util-visit";

/** A heading's flattened plain text, concatenating its `text` nodes and dropping inline markup. */
export function headingText(heading: Heading): string {
  let text = "";
  visit(heading, "text", (node) => {
    text += node.value;
  });
  return text;
}
