import { type ServerType, serve } from "@hono/node-server";
import type { App } from "./app.js";

/** The interface the dashboard binds. It is never reachable from another host. */
export const LOOPBACK_HOST = "127.0.0.1";

export interface Listener {
  server: ServerType;
  port: number;
  url: string;
}

/**
 * Binds `app` to `port` on the loopback interface.
 *
 * Rejects with the bind error — `EADDRINUSE` when the port is taken. Availability is
 * never probed before binding: that check would be a time-of-check-to-time-of-use race
 * against any other process, including a second dashboard starting at the same moment.
 */
export function listen(app: App, port: number): Promise<Listener> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname: LOOPBACK_HOST }, () => {
      server.off("error", reject);
      // The advertised URL names the exact interface we bound. `localhost` can resolve to
      // IPv6 `::1` first, where nothing is listening, so a browser opened there would fail.
      resolve({ server, port, url: `http://${LOOPBACK_HOST}:${port}` });
    });

    server.once("error", reject);
  });
}
