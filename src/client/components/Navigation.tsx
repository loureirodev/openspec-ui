import { NavLink } from "react-router";

const PAGES = [
  { to: "/changes", label: "Changes" },
  { to: "/archived", label: "Archived" },
  { to: "/specs", label: "Specs" },
];

/**
 * Rendered above the health gate, so it stays visible on the diagnostics screen and a
 * broken environment does not present as a crash.
 */
export function Navigation() {
  return (
    <nav aria-label="Primary">
      <ul className="navigation">
        {PAGES.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) => (isActive ? "nav-link nav-link--active" : "nav-link")}
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
