function randomInt(minMs, maxMs) {
  const min = Math.ceil(minMs);
  const max = Math.floor(maxMs);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function randomDelay(minMs, maxMs) {
  const delayMs = randomInt(minMs, maxMs);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return delayMs;
}

function logInfo(message, meta) {
  if (typeof meta !== "undefined") {
    console.log(`[${new Date().toISOString()}] INFO: ${message}`, meta);
    return;
  }

  console.log(`[${new Date().toISOString()}] INFO: ${message}`);
}

function logError(message, error) {
  if (typeof error !== "undefined") {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error);
    return;
  }

  console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
}

module.exports = {
  randomInt,
  randomDelay,
  logInfo,
  logError
};
