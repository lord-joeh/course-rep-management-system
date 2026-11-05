const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const { getQueue } = require("./queue");

async function setupBullBoard(app) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  const queue = await getQueue();

  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter: serverAdapter,
  });

  // Mount the dashboard route
  app.use("/api/admin/queues", serverAdapter.getRouter());
}

module.exports = setupBullBoard;
