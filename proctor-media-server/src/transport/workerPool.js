'use strict';

const mediasoup = require('mediasoup');
const os = require('os');
const config = require('../config');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {import('mediasoup').types.Worker[]} */
const workers = [];

/**
 * Tracks how many routers are open on each worker.
 * Key: worker object reference, Value: router count (integer ≥ 0).
 * @type {Map<import('mediasoup').types.Worker, number>}
 */
const workerLoad = new Map();

// ---------------------------------------------------------------------------
// Media codecs offered by every router created in this pool
// ---------------------------------------------------------------------------

const MEDIA_CODECS = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
    },
  },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Spawns a single mediasoup worker, registers it in `workers` and
 * `workerLoad`, and attaches the 'died' watchdog.
 *
 * @param {number} [replaceIndex]  When provided the new worker replaces
 *   workers[replaceIndex] instead of being pushed to the end of the array.
 * @returns {Promise<import('mediasoup').types.Worker>}
 */
async function _spawnWorker(replaceIndex) {
  const worker = await mediasoup.createWorker({
    logLevel: 'warn',
    logTags: ['rtp', 'srtp', 'rtcp'],
    rtcMinPort: config.RTC_MIN_PORT,
    rtcMaxPort: config.RTC_MAX_PORT,
  });

  logger.info({ pid: worker.pid }, `mediasoup worker spawned pid=${worker.pid}`);

  // Register in state
  if (replaceIndex !== undefined) {
    workers[replaceIndex] = worker;
  } else {
    workers.push(worker);
  }
  workerLoad.set(worker, 0);

  // Watchdog: restart on unexpected death
  worker.on('died', async (error) => {
    logger.error(
      { pid: worker.pid, err: error },
      `worker died pid=${worker.pid}, restarting...`
    );

    // Remove the dead worker from the load map
    workerLoad.delete(worker);

    // Find the dead worker's current index (it may have shifted)
    const idx = workers.indexOf(worker);
    const targetIndex = idx !== -1 ? idx : replaceIndex;

    // Wait 2 s before respawning so we don't tight-loop on a broken system
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      await _spawnWorker(targetIndex);
    } catch (spawnErr) {
      logger.error({ err: spawnErr }, 'failed to respawn mediasoup worker');
    }
  });

  return worker;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Spawns one mediasoup Worker per CPU core.
 * Must be called once at application startup before any router is created.
 *
 * @returns {Promise<void>}
 */
async function initWorkerPool() {
  const numCores = os.cpus().length;
  logger.info(`spawning ${numCores} mediasoup worker(s) (one per CPU core)`);

  const spawnPromises = Array.from({ length: numCores }, () => _spawnWorker());
  await Promise.all(spawnPromises);

  logger.info(`worker pool ready — ${workers.length} worker(s) online`);
}

/**
 * Returns the worker that currently has the fewest open routers.
 * Throws if the pool has not been initialised.
 *
 * @returns {import('mediasoup').types.Worker}
 */
function getLeastLoadedWorker() {
  if (workers.length === 0) {
    throw new Error('Worker pool is empty. Did you call initWorkerPool()?');
  }

  let leastLoaded = null;
  let minLoad = Infinity;

  for (const [worker, load] of workerLoad) {
    if (load < minLoad) {
      minLoad = load;
      leastLoaded = worker;
    }
  }

  if (!leastLoaded) {
    throw new Error('No healthy workers available in the pool.');
  }

  return leastLoaded;
}

/**
 * Creates a mediasoup Router on the given worker with the standard codec set.
 * Increments the worker's load counter.
 *
 * @param {import('mediasoup').types.Worker} worker
 * @returns {Promise<import('mediasoup').types.Router>}
 */
async function createRouter(worker) {
  const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });

  const current = workerLoad.get(worker) ?? 0;
  workerLoad.set(worker, current + 1);

  logger.debug(
    { workerPid: worker.pid, routerId: router.id, load: current + 1 },
    'router created'
  );

  return router;
}

/**
 * Decrements the router count for a worker when a room is destroyed.
 * The count never goes below 0.
 *
 * @param {import('mediasoup').types.Worker} worker
 */
function decrementWorkerLoad(worker) {
  const current = workerLoad.get(worker) ?? 0;
  const next = Math.max(0, current - 1);
  workerLoad.set(worker, next);

  logger.debug(
    { workerPid: worker.pid, load: next },
    'worker load decremented'
  );
}

module.exports = {
  initWorkerPool,
  getLeastLoadedWorker,
  createRouter,
  decrementWorkerLoad,
};
