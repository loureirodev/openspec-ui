/** Presentation-only helpers shared by the changes and archived browsers. */

/** Turns a kebab-case change name into a readable title, e.g. `add-foo-bar` -> `Add Foo Bar`. */
export function humanizeName(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Formats an ISO date/time string for display, falling back to the raw value if unparseable. */
export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
