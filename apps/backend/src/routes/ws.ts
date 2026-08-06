import type { FastifyInstance } from "fastify";

export async function registerWsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/ws/feed",
    { websocket: true },
    (connection) => {
      connection.socket.on("message", (_msg: unknown) => {
        // echo or dispatch to aggregation pipeline
      });
      connection.socket.send("connected to atlas feed");
    },
  );
}
