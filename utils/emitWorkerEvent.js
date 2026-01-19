const { client } = require("../config/redis");

async function emitWorkerEvent(eventType, eventData) {
  try {
    const payload = {
      type: eventType,
      ...eventData,
    };

    const result = await client.publish(
      "worker-events",
      JSON.stringify(payload)
    );

    console.log(
      ` Worker event ${eventType} published. Subscribers: ${result}`
    );
    return result;
  } catch (error) {
    console.error(
      ` Failed to publish worker event ${eventType}:`,
      error.message
    );
    return 0;
  }
}

module.exports = { emitWorkerEvent };
