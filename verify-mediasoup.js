'use strict';

const logger = require('./src/utils/logger');
const { initWorkerPool, getLeastLoadedWorker, createRouter } = require('./src/transport/workerPool');

async function check() {
  logger.info('--- Checking Mediasoup Worker Pool ---');
  
  try {
    // This will spawn 1 worker per CPU core
    await initWorkerPool();
    
    // Get a worker
    const worker = getLeastLoadedWorker();
    logger.info({ pid: worker.pid }, 'Successfully retrieved least loaded worker');

    // Create a router
    const router = await createRouter(worker);
    logger.info({ routerId: router.id }, 'Successfully created a mediasoup router');

    logger.info('Shutting down workers...');
    // We don't have a closePool yet, but closing the process will kill the worker subprocesses
    logger.info('--- Mediasoup check PASSED ---');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Mediasoup check FAILED');
    process.exit(1);
  }
}

check();
