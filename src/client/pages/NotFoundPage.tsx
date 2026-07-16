import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <section aria-labelledby="page-title" className="view-width--text">
      <h1 id="page-title">Page not found</h1>
      <p>
        That path does not match any page. <Link to="/changes">Go to changes</Link>.
      </p>
    </section>
  );
}
