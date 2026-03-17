let examTimerId = null
let questionPaperUrl = null
let examSubmitted = false
let examStarted = false
let currentAttempt = null
let isSubmitting = false
let visibilityViolationLogged = false
let blurViolationLogged = false
let audioContext = null
let audioUnlocked = false

const MAX_WARNINGS = 15
const NETWORK_APP_WARNING_COOLDOWN_MS = 5000
const recentBlockedAppWarnings = new Map()

function setExamStatus(message, type = 'info') {
  const status = document.getElementById('examMessage')

  if (!status) {
    return
  }

  status.hidden = !message
  status.className = `status-message ${type}`
  status.innerText = message || ''
}

function formatDuration(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function updateViolationCount(count) {
  document.getElementById('violationCount').innerText = String(count || 0)
}

function ensureAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return null
  }

  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    audioContext = new AudioContextClass()
  }

  return audioContext
}

async function unlockAlertAudio() {
  const context = ensureAudioContext()

  if (!context || audioUnlocked) {
    return
  }

  try {
    if (context.state === 'suspended') {
      await context.resume()
    }

    audioUnlocked = context.state === 'running'
  } catch (error) {
    console.error('Failed to unlock alert audio:', error)
  }
}

function registerAudioUnlockHandlers() {
  const unlock = () => {
    unlockAlertAudio()
  }

  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock, { passive: true })
}

function playWarningBeep() {
  const context = ensureAudioContext()

  if (!context || context.state !== 'running') {
    return
  }

  const startAt = context.currentTime
  const envelope = context.createGain()
  envelope.connect(context.destination)
  envelope.gain.setValueAtTime(0.001, startAt)
  envelope.gain.exponentialRampToValueAtTime(0.5, startAt + 0.01)
  envelope.gain.exponentialRampToValueAtTime(0.001, startAt + 0.45)

  ;[1200, 900, 1200].forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const segmentStart = startAt + index * 0.15
    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(frequency, segmentStart)
    oscillator.connect(envelope)
    oscillator.start(segmentStart)
    oscillator.stop(segmentStart + 0.12)
  })
}

function renderExamHeader(student) {
  document.getElementById('examStudentName').innerText = student.name
  document.getElementById('examStudentEmail').innerText = student.email
  document.getElementById('examTitle').innerText = student.exam
}

function updateSubmissionButton(isDisabled, label = 'Submit Exam') {
  const submitButton = document.getElementById('submitExamButton')

  if (!submitButton) {
    return
  }

  submitButton.disabled = isDisabled
  submitButton.innerText = label
}

function releaseExamResources() {
  if (examTimerId) {
    clearInterval(examTimerId)
    examTimerId = null
  }

  if (questionPaperUrl) {
    URL.revokeObjectURL(questionPaperUrl)
    questionPaperUrl = null
  }

  const video = document.getElementById('video')

  if (video?.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop())
    video.srcObject = null
  }

  if (window.electronAPI?.exitFullscreen) {
    window.electronAPI.exitFullscreen()
  }

  if (window.electronAPI?.stopExamMonitoring) {
    window.electronAPI.stopExamMonitoring()
  }
}

function renderCompletionScreen(reasonLabel) {
  document.body.innerHTML = `
    <div class="completion-screen">
      <div class="completion-card">
        <h1>Exam Completed</h1>
        <p>${reasonLabel}</p>
      </div>
    </div>
  `
}

function finishExamUI(reason) {
  examSubmitted = true
  releaseExamResources()

  const messageByReason = {
    manual_submit: 'Your exam has been submitted successfully.',
    timer_expired: 'Time is up. Your exam has been submitted automatically.',
    left_exam: 'Leaving the exam submitted your attempt automatically.',
    warning_limit_reached: `The exam was terminated permanently after reaching ${MAX_WARNINGS} warnings.`
  }

  renderCompletionScreen(messageByReason[reason] || 'Your exam session has ended successfully.')
}

async function reportViolation(type, detail) {
  if (!examStarted || examSubmitted) {
    return
  }

  try {
    const response = await fetchWithSession(`${API_BASE_URL}/api/exam/violations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type, detail })
    })

    if (!response) {
      return
    }

    const data = await response.json()

    if (response.ok && data.attempt) {
      currentAttempt = data.attempt
      updateViolationCount(data.attempt.violationCount)
      playWarningBeep()

      if (data.attempt.status === 'submitted') {
        setExamStatus(data.message || `Exam terminated after reaching ${MAX_WARNINGS} warnings.`, 'error')
        finishExamUI(data.attempt.submissionReason || 'warning_limit_reached')
      }
    }
  } catch (error) {
    console.error('Failed to report violation:', error)
  }
}

function startTimer(totalSeconds) {
  const timerElement = document.getElementById('timer')
  let remainingSeconds = totalSeconds

  timerElement.innerText = formatDuration(remainingSeconds)

  examTimerId = setInterval(() => {
    remainingSeconds -= 1

    if (remainingSeconds < 0) {
      submitExam('timer_expired')
      return
    }

    timerElement.innerText = formatDuration(remainingSeconds)
  }, 1000)
}

async function loadQuestionPaper(questionPaperName) {
  const response = await fetchWithSession(`${API_BASE_URL}/files/${questionPaperName}`)

  if (!response) {
    return
  }

  if (!response.ok) {
    throw new Error('Question paper request failed')
  }

  const fileBlob = await response.blob()
  questionPaperUrl = URL.createObjectURL(fileBlob)
  document.getElementById('questionFrame').src = `${questionPaperUrl}#toolbar=0`
}

async function startExamAttempt() {
  const response = await fetchWithSession(`${API_BASE_URL}/api/exam/start`, {
    method: 'POST'
  })

  if (!response) {
    return false
  }

  const data = await response.json()

  if (!response.ok || !data.success) {
    setExamStatus(data.message || 'Could not start this exam.', 'error')
    return false
  }

  currentAttempt = data.attempt
  updateViolationCount(data.attempt.violationCount)
  examStarted = true

  if (window.electronAPI?.startExamMonitoring) {
    window.electronAPI.startExamMonitoring()
  }

  return true
}

async function loadExam() {
  setExamStatus('Loading exam details...', 'info')

  try {
    const response = await fetchWithSession(`${API_BASE_URL}/api/exam`)

    if (!response) {
      return
    }

    const data = await response.json()

    if (!response.ok || !data.success) {
      setExamStatus('Could not load the exam data.', 'error')
      return
    }

    if (data.attempt?.status === 'submitted') {
      finishExamUI(data.attempt.submissionReason || 'manual_submit')
      return
    }

    renderExamHeader(data.student)

    const cameraReady = await startCamera()

    if (!cameraReady) {
      updateSubmissionButton(true, 'Blocked')
      return
    }

    const started = await startExamAttempt()

    if (!started) {
      return
    }

    startTimer(data.timerSeconds)
    await loadQuestionPaper(data.questionPaper)
    setExamStatus('Exam loaded successfully.', 'info')
  } catch (error) {
    console.error('Error loading exam:', error)
    setExamStatus('Failed to load the exam. Please verify the backend is running.', 'error')
  }
}

async function submitExam(reason = 'manual_submit') {
  if (examSubmitted || isSubmitting) {
    return
  }

  isSubmitting = true
  updateSubmissionButton(true, 'Submitting...')
  setExamStatus('Submitting your exam...', 'info')

  try {
    const response = await fetchWithSession(`${API_BASE_URL}/api/exam/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    })

    if (!response) {
      return
    }

    const data = await response.json()

    if (!response.ok || !data.success) {
      setExamStatus(data.message || 'Could not submit the exam.', 'error')
      return
    }

    currentAttempt = data.attempt
    finishExamUI(reason)
  } catch (error) {
    console.error('Submit error:', error)
    setExamStatus('Could not submit the exam. Please try again.', 'error')
  } finally {
    isSubmitting = false
    updateSubmissionButton(examSubmitted, examSubmitted ? 'Submitted' : 'Submit Exam')
  }
}

async function startCamera() {
  const video = document.getElementById('video')

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setExamStatus('A working camera is required before the exam can start.', 'error')
    return false
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const hasVideoInput = devices.some(device => device.kind === 'videoinput')

    if (!hasVideoInput) {
      setExamStatus('No camera was detected. Connect a working camera to start the exam.', 'error')
      return false
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    })

    video.srcObject = stream
    setExamStatus('Camera connected. Good luck!', 'info')
    startFrameCapture(video)
    return true
  } catch (error) {
    console.error('Camera error:', error)
    setExamStatus('The exam cannot start because the camera is unavailable or not working properly.', 'error')
    return false
  }
}

// Violation type mapping — keys match what your backend detectors return
const PROCTORING_VIOLATION_MAP = {
  // existing
  'No face detected':              { type: 'face_absent',        detail: 'Candidate face not visible in camera.' },
  'Multiple faces detected':       { type: 'multiple_faces',     detail: 'More than one face detected in frame.' },
  'Phone detected':                { type: 'phone_detected',     detail: 'A phone was detected in the camera frame.' },
  'Looking away from screen':      { type: 'gaze_away',          detail: 'Candidate gaze directed away from screen.' },
  'Talking detected':              { type: 'lip_movement',       detail: 'Lip movement suggesting speech detected.' },
  'Camera may be blocked':         { type: 'camera_blocked',     detail: 'Lighting anomaly — camera may be covered.' },
  // newly wired
  'Abnormal blink rate detected':  { type: 'blink_anomaly',      detail: 'Unusual blink pattern detected.' },
  'Lighting too dark — face not visible': { type: 'lighting_dark', detail: 'Camera feed too dark to verify candidate.' },
  'Background movement detected':  { type: 'background_motion',  detail: 'Unexpected movement detected in background.' },
  'Identity could not be verified':{ type: 'identity_mismatch',  detail: 'Candidate face does not match registered identity.' },
}

// Tracks which violation types are currently "active" so we don't spam
// reportViolation on every frame — only fires when a violation first appears
// or re-appears after clearing.
const activeViolations = new Set()

function startFrameCapture(video) {
  const canvas = document.createElement('canvas')
  const ctx    = canvas.getContext('2d')

  const WS_URL = (window.PROCTOR_WS_URL) || 'ws://localhost:8000/proctor'
  let ws       = null
  let intervalId = null

  function connect() {
    ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log('[Proctor] WebSocket connected')
      intervalId = setInterval(sendFrame, 1000 / 5)  // 5 fps
    }

    ws.onmessage = (event) => {
      if (!examStarted || examSubmitted) return

      let result
      try {
        result = JSON.parse(event.data)
      } catch {
        return
      }

      const incomingViolations = new Set(result.violations || [])

      // ── Report violations that are newly active this frame ──────────────
      for (const message of incomingViolations) {
        if (!activeViolations.has(message)) {
          // First time seeing this violation — report it
          const mapped = PROCTORING_VIOLATION_MAP[message]
          if (mapped) {
            reportViolation(mapped.type, mapped.detail)
          } else {
            // Fallback for any new violation type not yet in the map
            reportViolation('proctoring_alert', message)
          }
          setExamStatus(`⚠ ${message}`, 'error')
          activeViolations.add(message)
        }
      }

      // ── Clear violations that are no longer active ───────────────────────
      for (const message of activeViolations) {
        if (!incomingViolations.has(message)) {
          activeViolations.delete(message)
        }
      }

      // ── Restore status once all violations clear ─────────────────────────
      if (incomingViolations.size === 0) {
        setExamStatus('Camera connected. Good luck!', 'info')
      }
    }

    ws.onerror = (err) => {
      console.warn('[Proctor] WebSocket error:', err)
    }

    ws.onclose = () => {
      console.warn('[Proctor] WebSocket closed — reconnecting in 3s')
      clearInterval(intervalId)
      // Reconnect unless the exam is already over
      if (!examSubmitted) {
        setTimeout(connect, 3000)
      }
    }
  }

  function sendFrame() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!video.videoWidth) return  // video not ready yet

    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const frame = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
    ws.send(JSON.stringify({ frame }))
  }

  connect()
}


function shouldLogBlockedProcess(processName) {
  const key = String(processName || '').toLowerCase()
  const previousLoggedAt = recentBlockedAppWarnings.get(key) || 0
  const now = Date.now()

  if (now - previousLoggedAt < NETWORK_APP_WARNING_COOLDOWN_MS) {
    return false
  }

  recentBlockedAppWarnings.set(key, now)
  return true
}

async function goBackToDashboard() {
  if (examSubmitted) {
    window.location = 'dashboard.html'
    return
  }

  const shouldLeave = window.confirm('Leaving the exam will submit it immediately. Do you want to continue?')

  if (!shouldLeave) {
    return
  }

  await reportViolation('left_exam_view', 'Candidate left the exam view before completion.')
  await submitExam('left_exam')
}

function registerExamGuards() {
  document.addEventListener('contextmenu', event => event.preventDefault())
  document.addEventListener('copy', event => event.preventDefault())
  document.addEventListener('keydown', event => {
    if (event.ctrlKey && event.key.toLowerCase() === 'p') {
      event.preventDefault()
      setExamStatus('Printing is disabled during the exam.', 'error')
      reportViolation('blocked_shortcut', 'Candidate attempted to print during the exam.')
    }
  })

  window.addEventListener('blur', () => {
    if (!examStarted || examSubmitted || blurViolationLogged) {
      return
    }

    blurViolationLogged = true
    setExamStatus('Exam window focus was lost. This activity has been recorded.', 'error')
    reportViolation('window_blur', 'Candidate moved focus away from the exam window.')
  })

  window.addEventListener('focus', () => {
    blurViolationLogged = false
  })

  document.addEventListener('visibilitychange', () => {
    if (!examStarted || examSubmitted) {
      return
    }

    if (document.hidden && !visibilityViolationLogged) {
      visibilityViolationLogged = true
      setExamStatus('Exam visibility changed. This activity has been recorded.', 'error')
      reportViolation('visibility_hidden', 'Candidate switched away from the exam page.')
      return
    }

    if (!document.hidden) {
      visibilityViolationLogged = false
    }
  })

  if (window.electronAPI?.onFullscreenExited) {
    window.electronAPI.onFullscreenExited(() => {
      if (!examStarted || examSubmitted) {
        return
      }

      setExamStatus('Fullscreen was exited. This activity has been recorded.', 'error')
      reportViolation('fullscreen_exit', 'Candidate exited fullscreen mode during the exam.')
    })
  }

  if (window.electronAPI?.onNetworkAppBlocked) {
    window.electronAPI.onNetworkAppBlocked(processes => {
      if (!examStarted || examSubmitted) {
        return
      }

      const uniqueProcesses = Array.isArray(processes)
        ? processes.filter(processName => shouldLogBlockedProcess(processName))
        : []

      if (uniqueProcesses.length === 0) {
        return
      }

      const blockedList = uniqueProcesses.join(', ')
      setExamStatus(`Blocked network app detected and closed: ${blockedList}. This activity has been recorded.`, 'error')
      reportViolation('blocked_network_app', `Detected and closed blocked application(s): ${blockedList}.`)
    })
  }
}

window.addEventListener('beforeunload', () => {
  if (!examSubmitted) {
    reportViolation('page_unload', 'Exam page attempted to unload before submission.')
  }

  releaseExamResources()
})

window.addEventListener('load', async () => {
  registerExamGuards()
  registerAudioUnlockHandlers()
  await unlockAlertAudio()

  if (window.electronAPI?.startFullscreen) {
    window.electronAPI.startFullscreen()
  }

  await loadExam()
})
