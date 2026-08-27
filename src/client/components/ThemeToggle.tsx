import { useTheme } from "../lib/use-theme.js";

/**
 * Flips the dashboard between the light and the dark theme for the session.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const target = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={`Switch to ${target} theme`}
      onClick={toggle}
    >
      <svg
        className="icon-button__glyph"
        aria-hidden="true"
        width={16}
        height={16}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {theme === "dark" ? (
          <path d="M13.5 9.3A5.5 5.5 0 0 1 6.7 2.5 5.5 5.5 0 1 0 13.5 9.3Z" />
        ) : (
          <>
            <circle cx={8} cy={8} r={3.25} />
            <path d="M8 1v1.6M8 13.4V15M2.4 2.4l1.1 1.1M12.5 12.5l1.1 1.1M1 8h1.6M13.4 8H15M2.4 13.6l1.1-1.1M12.5 3.5l1.1-1.1" />
          </>
        )}
      </svg>
    </button>
  );
}
