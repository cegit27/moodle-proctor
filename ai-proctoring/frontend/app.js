const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const micStatus = document.getElementById('micStatus');
const cameraStatus = document.getElementById('cameraStatus');
const voiceStatus = document.getElementById('voiceStatus');
const audioLevel = document.getElementById('audioLevel');
const eventLog = document.getElementById('eventLog');
const warningBox = document.getElementById('warningBox');
const cameraPreview = document.getElementById('cameraPreview');

const state = {
  stream: null,
  audioContext: null,
  analyser: null,
  dataArray: null,
  animationFrameId: null,
  speaking: false,
  lastDetectionAt: 0,
  silenceHoldMs: 1200,
  threshold: 12,
  backendEventUrl: 'http://127.0.0.1:8000/speech-event',
  reportingCooldownMs: 3000,
  lastReportAt: 0,
};

function setBadge(element, text, className) {
  element.textContent = text;
  element.className = `badge ${className}`;
}

function addLog(message) {
  if (!eventLog) {
    return;
  }

  const placeholder = eventLog.querySelector('.placeholder');
  if (placeholder) {
    placeholder.remove();
  }

  const item = document.createElement('li');
  item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  eventLog.prepend(item);
}

function getAverageLevel(buffer) {
  let total = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    total += Math.abs(buffer[i] - 128);
  }
  return total / buffer.length;
}

async function reportSpeechEvent(message) {
  const now = Date.now();
  if (now - state.lastReportAt < state.reportingCooldownMs) {
    return;
  }

  const payload = {
    event_type: 'speech_detected',
    timestamp: new Date().toISOString(),
    transcript: message,
    source: 'frontend',
  };

  try {
    const response = await fetch(state.backendEventUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      state.lastReportAt = now;
    }
  } catch (error) {
    console.error('Unable to report speech event to backend.', error);
  }
}

function detectVoice() {
  if (!state.analyser || !state.dataArray) {
    return;
  }

  state.analyser.getByteTimeDomainData(state.dataArray);
  const averageLevel = getAverageLevel(state.dataArray);
  const levelPercent = Math.min(100, Math.round((averageLevel / 45) * 100));
  audioLevel.value = levelPercent;

  const now = Date.now();
  const speakingNow = averageLevel >= state.threshold;

  if (speakingNow) {
    state.lastDetectionAt = now;
    if (!state.speaking) {
      state.speaking = true;
      setBadge(voiceStatus, 'Voice detected', 'detected');
      warningBox.textContent = 'Warning: Do not speak during the exam.';
      warningBox.classList.add('alert');
      addLog('Warning triggered: voice detected from microphone input. Do not speak.');
      reportSpeechEvent('Warning triggered: voice detected from microphone input. Do not speak.');
    }
  } else if (state.speaking && now - state.lastDetectionAt > state.silenceHoldMs) {
    state.speaking = false;
    setBadge(voiceStatus, 'Listening for voice', 'active');
    warningBox.textContent = 'Monitoring active. Keep silent during the exam.';
    warningBox.classList.remove('alert');
  }

  state.animationFrameId = window.requestAnimationFrame(detectVoice);
}

async function startListening() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setBadge(micStatus, 'Unsupported browser', 'error');
    setBadge(cameraStatus, 'Unsupported browser', 'error');
    addLog('This browser does not support microphone access.');
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: {
        facingMode: 'user',
      },
    });

    cameraPreview.srcObject = state.stream;

    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = state.audioContext.createMediaStreamSource(state.stream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 2048;
    state.dataArray = new Uint8Array(state.analyser.frequencyBinCount);
    source.connect(state.analyser);

    setBadge(micStatus, 'Microphone connected', 'active');
    setBadge(cameraStatus, 'Camera connected', 'active');
    setBadge(voiceStatus, 'Listening for voice', 'active');
    warningBox.textContent = 'Monitoring active. Keep silent during the exam.';
    warningBox.classList.remove('alert');
    addLog('Camera and microphone access granted. Monitoring started.');

    startButton.disabled = true;
    stopButton.disabled = false;

    detectVoice();
  } catch (error) {
    console.error(error);
    setBadge(micStatus, 'Mic blocked/unavailable', 'error');
    setBadge(cameraStatus, 'Camera blocked/unavailable', 'error');
    setBadge(voiceStatus, 'Detection stopped', 'idle');
    warningBox.textContent = 'Access denied. Allow microphone and camera to monitor the exam.';
    warningBox.classList.add('alert');
    addLog('Camera/microphone permission denied or unavailable.');
  }
}

function stopListening() {
  if (state.animationFrameId) {
    window.cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }

  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  cameraPreview.srcObject = null;

  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
  }

  state.analyser = null;
  state.dataArray = null;
  state.speaking = false;
  audioLevel.value = 0;

  setBadge(micStatus, 'Stopped', 'idle');
  setBadge(cameraStatus, 'Stopped', 'idle');
  setBadge(voiceStatus, 'Waiting', 'waiting');
  warningBox.textContent = 'Monitoring stopped. Start again when ready.';
  warningBox.classList.remove('alert');
  state.lastReportAt = 0;
  addLog('Listening stopped.');

  startButton.disabled = false;
  stopButton.disabled = true;
}

startButton.addEventListener('click', startListening);
stopButton.addEventListener('click', stopListening);
