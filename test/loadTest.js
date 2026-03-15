'use strict';

const { io } = require('socket.io-client');
const argv = require('yargs')
  .option('students', { default: 10, type: 'number' })
  .option('batch', { default: 5, type: 'number' })
  .option('url', { default: 'http://localhost:4001' })
  .argv;

const TOTAL_STUDENTS = argv.students;
const BATCH_SIZE = argv.batch;
const SERVER_URL = argv.url;

async function runLoadTest() {
  console.log(`--- Starting Load Test: ${TOTAL_STUDENTS} students ---`);
  
  const stats = {
    connected: 0,
    joined: 0,
    errors: 0,
    latencies: []
  };

  const start = Date.now();

  for (let i = 0; i < TOTAL_STUDENTS; i += BATCH_SIZE) {
    const currentBatch = Math.min(BATCH_SIZE, TOTAL_STUDENTS - i);
    console.log(`Spawning batch of ${currentBatch} (Total progress: ${i}/${TOTAL_STUDENTS})...`);

    const promises = Array.from({ length: currentBatch }).map((_, idx) => {
      const id = i + idx;
      return new Promise((resolve) => {
        const joinStart = Date.now();
        const socket = io(SERVER_URL, {
          auth: { studentId: `STU_${id}`, examId: 'LOAD_TEST_01', role: 'student' },
          transports: ['websocket'],
          reconnection: false
        });

        socket.on('connect', () => {
          stats.connected++;
          socket.emit('join-exam', { rtpCapabilities: {} }, (res) => {
            if (res.error) {
              stats.errors++;
            } else {
              stats.joined++;
              stats.latencies.push(Date.now() - joinStart);
            }
            socket.disconnect();
            resolve();
          });
        });

        socket.on('connect_error', () => {
          stats.errors++;
          resolve();
        });

        // Timeout fallback
        setTimeout(resolve, 10000);
      });
    });

    await Promise.all(promises);
  }

  const duration = (Date.now() - start) / 1000;
  const avgLatency = stats.latencies.length > 0 
    ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length 
    : 0;
  
  // Sort latencies for p95
  stats.latencies.sort((a, b) => a - b);
  const p95 = stats.latencies[Math.floor(stats.latencies.length * 0.95)] || 0;

  console.log('\n--- Load Test Summary ---');
  console.log(`Total Students:  ${TOTAL_STUDENTS}`);
  console.log(`Connected:       ${stats.connected}`);
  console.log(`Joined Exam:     ${stats.joined}`);
  console.log(`Errors:          ${stats.errors}`);
  console.log(`Total Duration:  ${duration.toFixed(2)}s`);
  console.log(`Avg Join Time:   ${avgLatency.toFixed(2)}ms`);
  console.log(`p95 Join Time:   ${p95.toFixed(2)}ms`);
  
  if (stats.joined === TOTAL_STUDENTS) {
    console.log('\nRESULT: PASS');
  } else {
    console.log('\nRESULT: FAIL');
  }
}

runLoadTest();
