import { once } from "node:events";

// Bind only loopback, let the OS allocate a port, and explicitly await shutdown.
export async function startHttpServer(app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: "http://127.0.0.1:" + server.address().port,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
