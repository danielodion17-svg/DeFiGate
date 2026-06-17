const jobs = new Map();
let timer = null;
let running = false;

function now() {
  return Date.now();
}

function normalizeInterval(intervalMs) {
  const value = Number(intervalMs);
  return Number.isFinite(value) && value > 0 ? value : 1000;
}

function log(...args) {
  console.log('[scheduler]', ...args);
}

function scheduleNextTick() {
  if (timer) return;
  const nextRun = Array.from(jobs.values())
    .filter((job) => !job.stopped)
    .reduce((next, job) => Math.min(next, job.nextRun), Infinity);

  if (nextRun === Infinity) {
    return;
  }

  const delay = Math.max(100, nextRun - now());
  timer = setTimeout(() => {
    timer = null;
    tick().catch((error) => {
      console.error('[scheduler] tick error', error);
    });
  }, delay);
}

async function tick() {
  if (!running) return;
  const current = now();
  const dueJobs = Array.from(jobs.values()).filter((job) => !job.stopped && job.nextRun <= current);
  if (dueJobs.length === 0) {
    scheduleNextTick();
    return;
  }

  // Execute jobs in deterministic registration order.
  for (const job of dueJobs) {
    if (job.locked) {
      log(`skipping overlapping run for job=${job.name}`);
      job.nextRun = now() + job.intervalMs;
      continue;
    }
    executeJob(job).catch((error) => {
      console.error('[scheduler] job execution error', job.name, error);
    });
  }

  scheduleNextTick();
}

async function executeJob(job) {
  job.locked = true;
  job.lastRunAt = now();
  log(`starting job=${job.name} nextRun=${new Date(job.lastRunAt).toISOString()}`);
  try {
    await job.handler();
    job.lastSuccessAt = now();
    job.lastError = null;
    job.retryCount = 0;
    log(`completed job=${job.name} duration=${job.lastSuccessAt - job.lastRunAt}ms`);
  } catch (error) {
    job.lastError = error;
    job.retryCount += 1;
    const backoff = Math.min(job.intervalMs, 5000 * job.retryCount);
    log(`job error=${job.name} retryCount=${job.retryCount} error=${error.message || error} backoff=${backoff}ms`);
    job.nextRun = now() + backoff;
  } finally {
    job.locked = false;
    if (job.nextRun <= now()) {
      job.nextRun = now() + job.intervalMs;
    }
  }
}

export function getJobStatus(name) {
  const job = jobs.get(name);
  if (!job) return null;
  return {
    name: job.name,
    intervalMs: job.intervalMs,
    stopped: job.stopped,
    locked: job.locked,
    retryCount: job.retryCount,
    lastRunAt: job.lastRunAt,
    lastSuccessAt: job.lastSuccessAt,
    lastError: job.lastError ? String(job.lastError.message || job.lastError) : null,
    nextRun: job.nextRun,
  };
}

export function getJobStatuses() {
  return Array.from(jobs.values()).map((job) => getJobStatus(job.name));
}

export function isRunning() {
  return running;
}

export function stopJob(name) {
  const job = jobs.get(name);
  if (!job) {
    throw new Error(`Job not registered: ${name}`);
  }
  job.stopped = true;
  return job;
}

export function resumeJob(name) {
  const job = jobs.get(name);
  if (!job) {
    throw new Error(`Job not registered: ${name}`);
  }
  job.stopped = false;
  if (job.nextRun <= now()) {
    job.nextRun = now() + job.intervalMs;
  }
  scheduleNextTick();
  return job;
}

export function registerJob(name, intervalMs, handler) {
  if (!name || typeof name !== 'string') {
    throw new Error('Job name must be a string');
  }
  if (jobs.has(name)) {
    throw new Error(`Job already registered: ${name}`);
  }
  if (typeof handler !== 'function') {
    throw new Error(`Job handler for ${name} must be a function`);
  }

  const interval = normalizeInterval(intervalMs);
  const job = {
    name,
    intervalMs: interval,
    handler,
    locked: false,
    retryCount: 0,
    stopped: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    nextRun: now(),
  };
  jobs.set(name, job);
  log(`registered job=${name} intervalMs=${interval}`);
}

export async function start() {
  if (running) return;
  running = true;
  log('starting scheduler');
  scheduleNextTick();
}

export async function stop() {
  if (!running) return;
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  log('stopped scheduler');
}

export async function runOnce(name) {
  const job = jobs.get(name);
  if (!job) {
    throw new Error(`Job not registered: ${name}`);
  }
  if (job.locked) {
    log(`skipping runOnce overlap for job=${name}`);
    return;
  }
  await executeJob(job);
}

export default {
  registerJob,
  start,
  stop,
  runOnce,
  getJobStatus,
  getJobStatuses,
  stopJob,
  resumeJob,
};