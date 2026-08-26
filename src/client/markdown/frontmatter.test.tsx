import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownViewer } from "../components/MarkdownViewer.js";
import {
  FLAT_FRONTMATTER_TASK,
  GFM_BASELINE,
  NESTED_FRONTMATTER,
  SINGLE_KEY_FRONTMATTER,
  THEMATIC_BREAK_IN_BODY,
} from "./fixtures.js";
import { looksLikeFrontmatter, readFrontmatter } from "./frontmatter.js";

describe("looksLikeFrontmatter", () => {
  it.each([
    ["a flat mapping", "---\nid: 1\n---\n\n# Title\n"],
    ["a nested mapping", "---\nremote:\n  provider: redmine\n---\n\n# Title\n"],
    ["a comment above the first key", "---\n# sync metadata\nid: 1\n---\n\n# Title\n"],
    ["an empty block", "---\n---\n\n# Title\n"],
  ])("accepts %s", (_label, markdown) => {
    expect(looksLikeFrontmatter(markdown)).toBe(true);
  });

  it.each([
    ["a document opening with a thematic break", "---\n\nSome intro prose.\n\n---\n\n# Title\n"],
    ["a document with no leading delimiter", "# Title\n\nBody.\n"],
    ["a rule only in the body", "# Title\n\nProse.\n\n---\n\nMore.\n"],
    ["a heading between two rules", "---\n# Heading\n---\n\nBody.\n"],
    ["a heading and prose between two rules", "---\n\n# Heading\n\nProse.\n\n---\n\nBody.\n"],
    ["a bare URL between two rules", "---\n\nhttps://example.com/spec\n\n---\n\n# Title\n"],
  ])("rejects %s", (_label, markdown) => {
    expect(looksLikeFrontmatter(markdown)).toBe(false);
  });
});

describe("readFrontmatter", () => {
  it("reads a flat mapping as pairs in document order", () => {
    expect(readFrontmatter("id: 1\ngroup: event-registration\nstatus: 1")).toEqual({
      kind: "pairs",
      pairs: [
        { key: "id", value: "1" },
        { key: "group", value: "event-registration" },
        { key: "status", value: "1" },
      ],
    });
  });

  it("splits on the first colon only, so a value keeps its own", () => {
    expect(readFrontmatter("url: https://example.com/issues/1")).toEqual({
      kind: "pairs",
      pairs: [{ key: "url", value: "https://example.com/issues/1" }],
    });
  });

  it("keeps a repeated key as one pair per occurrence", () => {
    expect(readFrontmatter("tag: alpha\ntag: beta")).toEqual({
      kind: "pairs",
      pairs: [
        { key: "tag", value: "alpha" },
        { key: "tag", value: "beta" },
      ],
    });
  });

  it("reads a single-key block", () => {
    expect(readFrontmatter("remote_id: 149608")).toEqual({
      kind: "pairs",
      pairs: [{ key: "remote_id", value: "149608" }],
    });
  });

  it("keeps a value separated by more than one space, or by a tab", () => {
    expect(readFrontmatter("id:  1\nnote:\ttabbed")).toEqual({
      kind: "pairs",
      pairs: [
        { key: "id", value: "1" },
        { key: "note", value: "tabbed" },
      ],
    });
  });

  it("reads a key declared with no value", () => {
    expect(readFrontmatter("dependencies:")).toEqual({
      kind: "pairs",
      pairs: [{ key: "dependencies", value: "" }],
    });
  });

  it("reads an empty block as no pairs", () => {
    expect(readFrontmatter("")).toEqual({ kind: "pairs", pairs: [] });
    expect(readFrontmatter("\n  \n")).toEqual({ kind: "pairs", pairs: [] });
  });

  it("ignores blank lines between entries", () => {
    expect(readFrontmatter("id: 1\n\nstatus: 2")).toEqual({
      kind: "pairs",
      pairs: [
        { key: "id", value: "1" },
        { key: "status", value: "2" },
      ],
    });
  });

  it.each([
    ["a nested mapping", "remote:\n  provider: redmine\n  issue: 12345"],
    ["a sequence", "tags:\n  - alpha\n  - beta"],
    ["a top-level sequence item", "- alpha\n- beta"],
    ["a sequence of mappings", "- name: alpha\n- name: beta"],
    ["a quoted key", '"a: b": c'],
    ["an anchor-shaped key", "*ref: x"],
    ["a block scalar", "notes: |\n  first line\n  second line"],
    ["a comment line", "# sync metadata\nid: 1"],
    ["a line with no colon", "id: 1\njust some text"],
    ["a bare URL line", "https://example.com/spec"],
    ["a windows path", "C:\\Users\\dani"],
    ["a colon with no space after it", "TODO:algo"],
  ])("demotes %s to its verbatim text", (_label, source) => {
    expect(readFrontmatter(source)).toEqual({ kind: "verbatim", text: source });
  });

  it("never partially pairs a demoted block", () => {
    const source = "id: 1\nstatus: 2\nremote:\n  provider: redmine";
    const result = readFrontmatter(source);

    expect(result.kind).toBe("verbatim");
    expect(result).not.toHaveProperty("pairs");
  });
});

describe("frontmatter tokenisation", () => {
  it("does not render a leading frontmatter block as a rule plus a heading", () => {
    const { container } = render(<MarkdownViewer markdown={FLAT_FRONTMATTER_TASK} />);

    // Without a frontmatter extension the opening `---` parses as a thematic break and the
    // closing one as a setext underline, turning the whole YAML block into an `<h2>`.
    expect(container.querySelector("hr")).toBeNull();

    const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
    for (const heading of headings) {
      expect(heading.textContent).not.toContain("estimated_hours");
    }
    expect(headings[0]?.tagName).toBe("H1");
    expect(headings[0]?.textContent).toBe("Incorporar el módulo Registration");
  });

  it("leaves a document without frontmatter untouched", () => {
    const { container } = render(<MarkdownViewer markdown={GFM_BASELINE} />);

    expect(container.querySelector(".markdown-frontmatter")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Sample document");
  });

  it("still renders a thematic break that appears in the body", () => {
    const { container } = render(<MarkdownViewer markdown={THEMATIC_BREAK_IN_BODY} />);

    expect(container.querySelector("hr")).not.toBeNull();
    expect(container.querySelector(".markdown-frontmatter")).toBeNull();
  });

  it("leaves a document that opens with a thematic break alone", () => {
    // Ungated, `remark-frontmatter` claims the block between the two rules and the intro prose
    // renders as the document's own metadata — the body reported as the frontmatter.
    const { container } = render(
      <MarkdownViewer markdown={"---\n\nSome intro prose.\n\n---\n\n# Title\n\nBody.\n"} />,
    );

    expect(container.querySelector(".markdown-frontmatter")).toBeNull();
    expect(container.querySelector(".markdown-frontmatter-raw")).toBeNull();
    expect(container.querySelectorAll("hr")).toHaveLength(2);
    expect(container.querySelector("p")?.textContent).toBe("Some intro prose.");
  });

  it("known limitation: a colon-bearing line between two rules still reads as a key", () => {
    // Pinned, not endorsed. No rule short of semantic understanding separates `Note: …` from a
    // one-key mapping — a real YAML parser would call it a mapping too. Recorded so the day
    // someone tries to "fix" it, the trade-off is visible rather than rediscovered.
    const { container } = render(
      <MarkdownViewer markdown={"---\n\nNote: this is prose.\n\n---\n\n# Title\n"} />,
    );

    expect(container.querySelector("dt")?.textContent).toBe("Note");
    expect(container.querySelector("dd")?.textContent).toBe("this is prose.");
  });

  it("recognises frontmatter on the nested and single-key fixtures too", () => {
    for (const markdown of [SINGLE_KEY_FRONTMATTER, NESTED_FRONTMATTER]) {
      const { container } = render(<MarkdownViewer markdown={markdown} />);
      expect(container.querySelector("hr")).toBeNull();
    }
  });
});

describe("frontmatter rendering", () => {
  it("renders every key and value of a flat block, in document order", () => {
    const { container } = render(<MarkdownViewer markdown={FLAT_FRONTMATTER_TASK} />);

    const list = container.querySelector("dl.markdown-frontmatter");
    expect(list).not.toBeNull();

    const keys = Array.from(list?.querySelectorAll("dt") ?? []).map((dt) => dt.textContent);
    const values = Array.from(list?.querySelectorAll("dd") ?? []).map((dd) => dd.textContent);

    expect(keys).toEqual([
      "id",
      "group",
      "dependencies",
      "status",
      "created",
      "estimated_hours",
      "remote_id",
      "parent_issue_id",
    ]);
    expect(values).toEqual([
      "1",
      "event-registration",
      "[]",
      "1",
      "2026-07-28",
      "8",
      "149609",
      "0",
    ]);
  });

  it("groups each pair so it wraps as one unit", () => {
    const { container } = render(<MarkdownViewer markdown={FLAT_FRONTMATTER_TASK} />);

    const pairs = container.querySelectorAll("dl.markdown-frontmatter > div");
    expect(pairs).toHaveLength(8);
    for (const pair of pairs) {
      expect(pair.querySelectorAll("dt")).toHaveLength(1);
      expect(pair.querySelectorAll("dd")).toHaveLength(1);
    }
  });

  it("renders a value as its literal text, never as a link", () => {
    const { container } = render(<MarkdownViewer markdown={FLAT_FRONTMATTER_TASK} />);

    const block = container.querySelector("dl.markdown-frontmatter");
    expect(block?.querySelector("a")).toBeNull();
    expect(block?.textContent).toContain("149609");
  });

  it("renders a single-key block above the body", () => {
    const { container } = render(<MarkdownViewer markdown={SINGLE_KEY_FRONTMATTER} />);

    const pairs = container.querySelectorAll("dl.markdown-frontmatter > div");
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.textContent).toBe("remote_id149608");
  });

  it("renders non-flat frontmatter as its verbatim text, line breaks preserved", () => {
    const { container } = render(<MarkdownViewer markdown={NESTED_FRONTMATTER} />);

    expect(container.querySelector("dl.markdown-frontmatter")).toBeNull();

    const raw = container.querySelector("pre.markdown-frontmatter-raw code");
    expect(raw?.textContent).toBe(
      "remote:\n  provider: redmine\n  issue: 12345\ntags:\n  - alpha\n  - beta",
    );
  });

  it("renders the document body normally after the metadata block", () => {
    const { container } = render(<MarkdownViewer markdown={FLAT_FRONTMATTER_TASK} />);

    expect(container.querySelector("h1")?.textContent).toBe("Incorporar el módulo Registration");
    expect(container.querySelector("h2")?.textContent).toBe("Objetivos");
  });

  it("leaves a heading between two rules as a heading", () => {
    // A `#` line is a YAML comment and a markdown heading alike, so accepting a block that held
    // nothing but comments would show a document's own `<h1>` as its metadata.
    const { container } = render(<MarkdownViewer markdown={"---\n# Heading\n---\n\nBody.\n"} />);

    expect(container.querySelector(".markdown-frontmatter")).toBeNull();
    expect(container.querySelector(".markdown-frontmatter-raw")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Heading");
    expect(container.querySelectorAll("hr")).toHaveLength(2);
  });

  it("emits no metadata block for an empty frontmatter block", () => {
    const { container } = render(<MarkdownViewer markdown={"---\n---\n\n# Title\n"} />);

    expect(container.querySelector(".markdown-frontmatter")).toBeNull();
    expect(container.querySelector(".markdown-frontmatter-raw")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Title");
  });

  it("never turns frontmatter into active markup", () => {
    const { container } = render(
      <MarkdownViewer
        markdown={"---\nnote: <script>window.__pwned = true;</script>\n---\n\nx\n"}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("dd")?.textContent).toBe(
      "<script>window.__pwned = true;</script>",
    );
  });
});
