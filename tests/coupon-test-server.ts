import { createServer, type Server } from "node:http";

// Serves fixed pages by path (including the query string) for the
// coupon-site adapter tests; unknown paths return 404.
export async function withPages(
  pages: Record<string, string>,
  run: (origin: string, requests: string[]) => Promise<void>,
): Promise<void> {
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    const path = request.url ?? "/";
    requests.push(path);
    const body = pages[path];
    response.writeHead(body === undefined ? 404 : 200, { "content-type": "text/html; charset=utf-8" });
    response.end(body ?? "not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
