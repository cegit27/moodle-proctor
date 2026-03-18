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
let blockedAppMonitoringEnabled = true
let blurEventCount = 0
let visibilityEventCount = 0
let reconnectCheckTimerId = null
let backendDisconnected = false
let frameCaptureController = null
let aiProctoringStatus = {
  state: 'idle',
  detail: 'Waiting for AI proctoring to start.'
}
let liveAiWarnings = []

const EXAM_CONFIG = {
  maxWarnings: 15,
  networkAppWarningCooldownMs: 5000,
  reconnectCheckIntervalMs: 5000
}
const MAX_WARNINGS = EXAM_CONFIG.maxWarnings
const recentBlockedAppWarnings = new Map()
const USER_FACING_WARNING_COPY = {
  face_absent: {
    title: 'Face not visible',
    detail: 'Your face was not clearly visible in the camera.'
  },
  multiple_faces: {
    title: 'Multiple faces detected',
    detail: 'More than one face was visible in the camera.'
  },
  phone_detected: {
    title: 'Phone detected',
    detail: 'A phone was detected in your camera view.'
  },
  gaze_away: {
    title: 'Looking away',
    detail: 'You looked away from the screen.'
  },
  lip_movement: {
    title: 'Talking detected',
    detail: 'Talking or repeated lip movement was detected.'
  },
  camera_blocked: {
    title: 'Camera may be blocked',
    detail: 'Your camera view may be blocked or unclear.'
  },
  blink_anomaly: {
    title: 'Unusual blink pattern',
    detail: 'An unusual blink pattern was detected.'
  },
  lighting_dark: {
    title: 'Lighting too dark',
    detail: 'The room is too dark to clearly verify your face.'
  },
  background_motion: {
    title: 'Background movement',
    detail: 'Unexpected movement was detected in the background.'
  },
  identity_mismatch: {
    title: 'Identity could not be verified',
    detail: 'Your face could not be matched clearly for verification.'
  },
  left_exam_view: {
    title: 'You left the exam view',
    detail: 'You tried to leave the exam before submitting.'
  },
  blocked_shortcut: {
    title: 'Blocked shortcut used',
    detail: 'A restricted keyboard shortcut was used during the exam.'
  },
  window_blur: {
    title: 'Exam window focus lost',
    detail: 'You switched focus away from the exam window.'
  },
  visibility_hidden: {
    title: 'Exam page hidden',
    detail: 'You switched away from the exam page.'
  },
  fullscreen_exit: {
    title: 'Fullscreen exited',
    detail: 'You exited fullscreen mode during the exam.'
  },
  blocked_network_app: {
    title: 'Blocked app detected',
    detail: 'A blocked app was opened and closed automatically.'
  },
  proctor_connection_lost: {
    title: 'Proctoring reconnecting',
    detail: 'The proctoring connection was interrupted and is trying to reconnect.'
  },
  proctor_reconnected: {
    title: 'Proctoring connected',
    detail: 'The proctoring connection is active again.'
  },
  page_unload: {
    title: 'Page unload detected',
    detail: 'The exam page was closed or reloaded before submission.'
  },
  proctoring_alert: {
    title: 'Proctoring alert',
    detail: 'A proctoring alert was detected during the exam.'
  }
}

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
  const normalizedCount = Number(count || 0)
  const violationCountElement = document.getElementById('violationCount')
  const warningProgressElement = document.getElementById('warningProgress')

  if (violationCountElement) {
    violationCountElement.innerText = String(normalizedCount)
  }

  if (!warningProgressElement) {
    return
  }

  warningProgressElement.classList.remove(
    'warning-progress-safe',
    'warning-progress-warning',
    'warning-progress-danger'
  )

  if (normalizedCount >= 12) {
    warningProgressElement.classList.add('warning-progress-danger')
    return
  }

  if (normalizedCount >= 8) {
    warningProgressElement.classList.add('warning-progress-warning')
    return
  }

  warningProgressElement.classList.add('warning-progress-safe')
}

function formatViolationTimestamp(timestamp) {
  if (!timestamp) {
    return 'Time unavailable'
  }

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return 'Time unavailable'
  }

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getUserFacingWarningCopy(violation = {}) {
  const mappedCopy = USER_FACING_WARNING_COPY[violation.type]

  if (mappedCopy) {
    return {
      title: mappedCopy.title,
      detail: violation.detail || mappedCopy.detail
    }
  }

  return {
    title: violation.type || 'Warning recorded',
    detail: violation.detail || 'A warning was recorded for this exam attempt.'
  }
}

function renderVideoFeedState() {
  const videoBox = document.getElementById('proctorVideoBox')
  const statusText = document.getElementById('videoAiStatusText')
  const statusBadge = document.getElementById('videoAiStatusBadge')
  const warningOverlay = document.getElementById('videoWarningOverlay')
  const warningText = document.getElementById('videoWarningText')
  const warningStack = document.getElementById('videoWarningStack')

  if (!videoBox || !statusText || !statusBadge || !warningOverlay || !warningText || !warningStack) {
    return
  }

  const hasWarnings = liveAiWarnings.length > 0
  const normalizedState = hasWarnings
    ? 'warning'
    : (aiProctoringStatus.state || 'idle')

  videoBox.classList.remove(
    'video-box-idle',
    'video-box-monitoring',
    'video-box-warning',
    'video-box-error'
  )
  statusBadge.classList.remove(
    'video-status-badge-idle',
    'video-status-badge-monitoring',
    'video-status-badge-warning',
    'video-status-badge-error'
  )

  const modeToBoxClass = {
    idle: 'video-box-idle',
    starting: 'video-box-monitoring',
    running: 'video-box-monitoring',
    warning: 'video-box-warning',
    stopped: 'video-box-idle',
    error: 'video-box-error'
  }
  const modeToBadgeClass = {
    idle: 'video-status-badge-idle',
    starting: 'video-status-badge-monitoring',
    running: 'video-status-badge-monitoring',
    warning: 'video-status-badge-warning',
    stopped: 'video-status-badge-idle',
    error: 'video-status-badge-error'
  }
  const modeToBadgeLabel = {
    idle: 'Idle',
    starting: 'Starting',
    running: 'Live',
    warning: 'Alert',
    stopped: 'Stopped',
    error: 'Error'
  }

  videoBox.classList.add(modeToBoxClass[normalizedState] || 'video-box-idle')
  statusBadge.classList.add(modeToBadgeClass[normalizedState] || 'video-status-badge-idle')
  statusBadge.innerText = modeToBadgeLabel[normalizedState] || 'Idle'

  if (hasWarnings) {
    const primaryWarning = liveAiWarnings[0]
    statusText.innerText = `${liveAiWarnings.length} live warning${liveAiWarnings.length > 1 ? 's' : ''} on the camera feed.`
    warningOverlay.hidden = false
    warningText.innerText = primaryWarning
    warningStack.innerHTML = liveAiWarnings
      .slice(0, 3)
      .map(warning => `<div class="video-warning-pill video-warning-pill-warning">${escapeHtml(warning)}</div>`)
      .join('')
    return
  }

  warningOverlay.hidden = true
  statusText.innerText = aiProctoringStatus.detail || 'AI monitoring is standing by.'
  warningStack.innerHTML = '<div class="video-warning-pill video-warning-pill-neutral">No live AI warnings</div>'
}

function setLiveAIWarnings(warnings = []) {
  liveAiWarnings = Array.isArray(warnings)
    ? warnings.filter(Boolean).slice(0, 3)
    : []
  renderVideoFeedState()
}

function setAIProctoringStatus(status = {}) {
  aiProctoringStatus = {
    state: status.state || 'idle',
    detail: status.detail || 'AI proctoring status is unavailable.'
  }
  renderVideoFeedState()
}

function showViolationStatus(violation = {}) {
  const warningCopy = getUserFacingWarningCopy(violation)
  const severity = violation.severity === 'info' ? 'info' : 'error'
  setExamStatus(`${warningCopy.title}. ${warningCopy.detail}`, severity)
}

function renderDevMonitoringState(settings = {}) {
  const panel = document.getElementById('devMonitoringPanel')
  const toggle = document.getElementById('devBlockedAppToggle')
  const message = document.getElementById('devMonitoringMessage')

  if (!panel || !toggle || !message) {
    return
  }

  const isDevelopmentMode = Boolean(settings.isDevelopmentMode)
  blockedAppMonitoringEnabled = Boolean(settings.blockedAppMonitoringEnabled)

  panel.hidden = !isDevelopmentMode

  if (!isDevelopmentMode) {
    return
  }

  toggle.checked = blockedAppMonitoringEnabled
  message.innerText = blockedAppMonitoringEnabled
    ? 'Blocked app monitoring is enabled for this dev session. Matching apps will be closed.'
    : 'Blocked app monitoring is disabled in development until you turn it on here.'
}

async function loadDevMonitoringSettings() {
  if (!window.electronAPI?.getExamDevSettings) {
    return
  }

  try {
    const settings = await window.electronAPI.getExamDevSettings()
    renderDevMonitoringState(settings)
  } catch (error) {
    console.error('Failed to load dev monitoring settings:', error)
  }
}

function registerDevMonitoringControls() {
  const toggle = document.getElementById('devBlockedAppToggle')

  if (!toggle || !window.electronAPI?.setBlockedAppMonitoringEnabled) {
    return
  }

  toggle.addEventListener('change', async () => {
    try {
      const settings = await window.electronAPI.setBlockedAppMonitoringEnabled(toggle.checked)
      renderDevMonitoringState(settings)
    } catch (error) {
      toggle.checked = blockedAppMonitoringEnabled
      console.error('Failed to update blocked app monitoring setting:', error)
    }
  })
}

function renderWarningHistory(violations = []) {
  const historyList = document.getElementById('warningHistoryList')

  if (!historyList) {
    return
  }

  const recentViolations = Array.isArray(violations)
    ? violations.slice(-5).reverse()
    : []

  if (recentViolations.length === 0) {
    historyList.innerHTML = '<li style="color: #475467; font-size: 14px;">No warnings recorded yet.</li>'
    return
  }

  historyList.innerHTML = recentViolations
    .map(violation => {
      const warningCopy = getUserFacingWarningCopy(violation)
      const detail = escapeHtml(warningCopy.detail)
      const type = escapeHtml(warningCopy.title)
      const timestamp = escapeHtml(formatViolationTimestamp(violation.createdAt))
      const severityLabel = escapeHtml(
        violation.severity === 'info' ? 'Info' : 'Warning'
      )

      return `
        <li style="padding: 12px; border: 1px solid #eaecf0; border-radius: 10px; background: #f8fafc;">
          <div style="font-size: 13px; color: #475467; margin-bottom: 6px;">${timestamp} · ${severityLabel}</div>
          <div style="font-weight: 700; color: #101828; margin-bottom: 4px;">${type}</div>
          <div style="font-size: 14px; color: #344054; line-height: 1.4;">${detail}</div>
        </li>
      `
    })
    .join('')
}

function renderQuestionSummary(questions = []) {
  const questionList = document.getElementById('questionSummaryList')

  if (!questionList) {
    return
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    questionList.innerHTML = '<li style="color: #475467; font-size: 14px;">No question summary is available.</li>'
    return
  }

  questionList.innerHTML = questions
    .map(question => {
      const questionText = escapeHtml(question.question || 'Untitled question')
      const options = Array.isArray(question.options) ? question.options : []

      const optionMarkup = options.length === 0
        ? '<li style="color: #475467; font-size: 13px;">No options listed.</li>'
        : options
            .map(option => `<li style="font-size: 13px; color: #344054;">${escapeHtml(option)}</li>`)
            .join('')

      return `
        <li style="padding: 12px; border: 1px solid #eaecf0; border-radius: 10px; background: #f8fafc;">
          <div style="font-weight: 700; color: #101828; margin-bottom: 8px;">${questionText}</div>
          <ul style="margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px;">
            ${optionMarkup}
          </ul>
        </li>
      `
    })
    .join('')
}

async function loadQuestionSummary() {
  try {
    const response = await fetchWithSession(`${API_BASE_URL}/api/questions`)

    if (!response) {
      markBackendDisconnected('We could not load the question summary. Trying to reconnect...')
      return false
    }

    if (!response.ok) {
      throw new Error('Question summary request failed')
    }

    const data = await response.json()
    renderQuestionSummary(data)
    return true
  } catch (error) {
    markBackendDisconnected('We could not load the question summary. Trying to reconnect...')
    throw error
  }
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

function setNavigationButtonsDisabled(isDisabled) {
  const buttons = document.querySelectorAll('.secondary-btn')
  buttons.forEach(button => {
    button.disabled = isDisabled
  })
}

function clearReconnectCheck() {
  if (!reconnectCheckTimerId) {
    return
  }

  clearInterval(reconnectCheckTimerId)
  reconnectCheckTimerId = null
}

function setBackendDisconnectedState(isDisconnected, message) {
  backendDisconnected = isDisconnected

  if (isDisconnected) {
    updateSubmissionButton(true, 'Backend Offline')
    setNavigationButtonsDisabled(true)
    setExamStatus(
      message || 'Connection to the exam server was lost. We will keep trying to reconnect.',
      'error'
    )
    return
  }

  setNavigationButtonsDisabled(false)
  updateSubmissionButton(examSubmitted || isSubmitting, examSubmitted ? 'Submitted' : 'Submit Exam')
  setExamStatus(message || 'Connection restored. You can continue your exam.', 'info')
}

async function checkBackendConnection() {
  const response = await fetchWithSession(`${API_BASE_URL}/api/session`)

  if (!response) {
    markBackendDisconnected('We could not start the exam right now. Trying to reconnect...')
    return false
  }

  return response.ok
}

function startReconnectChecks() {
  if (reconnectCheckTimerId) {
    return
  }

  reconnectCheckTimerId = setInterval(async () => {
    try {
      const isConnected = await checkBackendConnection()

      if (!isConnected) {
        return
      }

      clearReconnectCheck()
      setBackendDisconnectedState(false, 'Connection restored. You can continue your exam.')
    } catch (error) {
      console.error('Reconnect check failed:', error)
    }
  }, EXAM_CONFIG.reconnectCheckIntervalMs)
}

function markBackendDisconnected(message) {
  setBackendDisconnectedState(true, message)
  startReconnectChecks()
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

  if (frameCaptureController?.stop) {
    frameCaptureController.stop()
    frameCaptureController = null
  }

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

  if (window.electronAPI?.stopAIProctoringService) {
    window.electronAPI.stopAIProctoringService()
  }

  clearReconnectCheck()
  activeViolations.clear()
  setLiveAIWarnings([])
}

function formatCompletionLabel(value, fallback = 'Not available') {
  if (!value) {
    return fallback
  }

  return String(value)
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatCompletionTimestamp(timestamp) {
  if (!timestamp) {
    return 'Not available'
  }

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function renderCompletionScreen(reasonLabel, attempt = {}) {
  const warningCount = Number(attempt.violationCount || 0)
  const maxWarnings = Number(attempt.maxWarnings || MAX_WARNINGS)
  const submissionReason = formatCompletionLabel(
    attempt.submissionReason,
    formatCompletionLabel(reasonLabel, 'Completed')
  )
  const submittedAt = formatCompletionTimestamp(attempt.submittedAt)
  const shouldContactInvigilator = [
    'left_exam',
    'warning_limit_reached'
  ].includes(attempt.submissionReason)

  document.body.innerHTML = `
    <div class="completion-screen">
      <div class="completion-card">
        <h1>Exam Completed</h1>
        <p>${escapeHtml(reasonLabel)}</p>
        <div style="margin-top: 20px; text-align: left; display: grid; gap: 12px;">
          <div>
            <strong>Submission reason:</strong>
            <span>${escapeHtml(submissionReason)}</span>
          </div>
          <div>
            <strong>Submitted at:</strong>
            <span>${escapeHtml(submittedAt)}</span>
          </div>
          <div>
            <strong>Warnings used:</strong>
            <span>${escapeHtml(`${warningCount} / ${maxWarnings}`)}</span>
          </div>
        </div>
        <p style="margin-top: 20px; color: #475467;">
          ${shouldContactInvigilator
            ? 'Please contact the invigilator if you need clarification about this submission.'
            : 'If you have any questions, please contact the invigilator.'}
        </p>
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

  renderCompletionScreen(
    messageByReason[reason] || 'Your exam session has ended successfully.',
    currentAttempt || { submissionReason: reason }
  )
}

async function reportViolation(type, detail, severity = 'warning') {
  if (!examStarted || examSubmitted) {
    return
  }

  try {
    const response = await fetchWithSession(`${API_BASE_URL}/api/exam/violations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type, detail, severity })
    })

    if (!response) {
      markBackendDisconnected('We could not reach the exam server while recording this event. Trying to reconnect...')
      return
    }

    const data = await response.json()

    if (response.ok && data.attempt) {
      if (backendDisconnected) {
        clearReconnectCheck()
        setBackendDisconnectedState(false, 'Connection restored. Your exam is back online.')
      }
      currentAttempt = data.attempt
      updateViolationCount(data.attempt.violationCount)
      renderWarningHistory(data.attempt.violations)
      if (severity === 'warning') {
        playWarningBeep()
      }

      if (data.attempt.status === 'submitted') {
        setExamStatus(data.message || `Exam terminated after reaching ${MAX_WARNINGS} warnings.`, 'error')
        finishExamUI(data.attempt.submissionReason || 'warning_limit_reached')
      } else {
        showViolationStatus({ type, detail, severity })
      }
    }
  } catch (error) {
    console.error('Failed to report violation:', error)
    markBackendDisconnected('We could not reach the exam server while recording this event. Trying to reconnect...')
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
    markBackendDisconnected('We could not load the question paper. Trying to reconnect...')
    return false
  }

  if (!response.ok) {
    throw new Error('Question paper request failed')
  }

  const fileBlob = await response.blob()
  questionPaperUrl = URL.createObjectURL(fileBlob)
  document.getElementById('questionFrame').src = `${questionPaperUrl}#toolbar=0`
  return true
}

async function startExamAttempt() {
  const response = await fetchWithSession(`${API_BASE_URL}/api/exam/start`, {
    method: 'POST'
  })

  if (!response) {
    markBackendDisconnected('We could not start the exam right now. Trying to reconnect...')
    return false
  }

  const data = await response.json()

  if (!response.ok || !data.success) {
    setExamStatus(data.message || 'Could not start this exam.', 'error')
    return false
  }

  currentAttempt = data.attempt
  if (backendDisconnected) {
    clearReconnectCheck()
    setBackendDisconnectedState(false, 'Connection restored. You can continue your exam.')
  }
  updateViolationCount(data.attempt.violationCount)
  renderWarningHistory(data.attempt.violations)
  examStarted = true

  if (window.electronAPI?.startExamMonitoring) {
    window.electronAPI.startExamMonitoring()
  }

  return true
}

async function loadExam() {
  setExamStatus('Loading your exam...', 'info')

  try {
    const response = await fetchWithSession(`${API_BASE_URL}/api/exam`)

    if (!response) {
      markBackendDisconnected('We could not load your exam. Trying to reconnect...')
      return
    }

    const data = await response.json()

    if (!response.ok || !data.success) {
      setExamStatus('We could not load your exam right now.', 'error')
      return
    }

    if (data.attempt?.status === 'submitted') {
      finishExamUI(data.attempt.submissionReason || 'manual_submit')
      return
    }

    currentAttempt = data.attempt
    renderExamHeader(data.student)
    updateViolationCount(data.attempt?.violationCount)
    renderWarningHistory(data.attempt?.violations)

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
    const paperLoaded = await loadQuestionPaper(data.questionPaper)

    if (!paperLoaded) {
      return
    }

    await loadQuestionSummary()
    setExamStatus('Your exam is ready. Stay focused and good luck.', 'info')
  } catch (error) {
    console.error('Error loading exam:', error)
    markBackendDisconnected('We could not connect to the exam server. Trying to reconnect...')
  }
}

async function submitExam(reason = 'manual_submit') {
  if (examSubmitted || isSubmitting) {
    return
  }

  isSubmitting = true
  updateSubmissionButton(true, 'Submitting...')
  setExamStatus('Submitting your exam. Please wait...', 'info')

  try {
    const response = await fetchWithSession(`${API_BASE_URL}/api/exam/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    })

    if (!response) {
      markBackendDisconnected('We could not reach the exam server to submit your exam. Trying to reconnect...')
      return
    }

    const data = await response.json()

    if (!response.ok || !data.success) {
      setExamStatus(data.message || 'We could not submit your exam right now.', 'error')
      return
    }

    currentAttempt = data.attempt
    if (backendDisconnected) {
      clearReconnectCheck()
    }
    finishExamUI(reason)
  } catch (error) {
    console.error('Submit error:', error)
    markBackendDisconnected('We could not submit your exam right now. Trying to reconnect...')
  } finally {
    isSubmitting = false
    if (!backendDisconnected) {
      updateSubmissionButton(examSubmitted, examSubmitted ? 'Submitted' : 'Submit Exam')
    }
  }
}

async function startCamera() {
  const video = document.getElementById('video')

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setExamStatus('You need a working camera before the exam can start.', 'error')
    return false
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const hasVideoInput = devices.some(device => device.kind === 'videoinput')

    if (!hasVideoInput) {
      setExamStatus('No camera was detected. Connect one to continue with the exam.', 'error')
      return false
    }

    if (window.electronAPI?.ensureAIProctoringService) {
      setAIProctoringStatus({
        state: 'starting',
        detail: 'Starting AI proctoring and preparing the live feed...'
      })

      const serviceStatus = await window.electronAPI.ensureAIProctoringService()
      setAIProctoringStatus(serviceStatus)

      if (serviceStatus?.state === 'error') {
        setExamStatus(serviceStatus.detail || 'AI proctoring could not be started.', 'error')
        return false
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    })

    video.srcObject = stream
    setExamStatus('Your camera is connected. You are ready to begin.', 'info')
    frameCaptureController = startFrameCaptureWithOverlay(video)
    return true
  } catch (error) {
    console.error('Camera error:', error)
    setExamStatus('We could not access your camera. Check camera permissions and try again.', 'error')
    setAIProctoringStatus({
      state: 'error',
      detail: 'Camera access failed. AI monitoring could not continue.'
    })

    if (window.electronAPI?.stopAIProctoringService) {
      window.electronAPI.stopAIProctoringService()
    }

    return false
  }
}

// Violation type mapping — keys match what your backend detectors return
const PROCTORING_VIOLATION_MAP = {
  // Existing checks
  'No face detected':              { type: 'face_absent',        detail: 'Candidate face not visible in camera.' },
  'Multiple faces detected':       { type: 'multiple_faces',     detail: 'More than one face detected in frame.' },
  'Phone detected':                { type: 'phone_detected',     detail: 'A phone was detected in the camera frame.' },
  'Looking away from screen':      { type: 'gaze_away',          detail: 'Candidate gaze directed away from screen.' },
  'Talking detected':              { type: 'lip_movement',       detail: 'Lip movement suggesting speech detected.' },
  'Camera may be blocked':         { type: 'camera_blocked',     detail: 'Lighting anomaly — camera may be covered.' },
  // Additional checks
  'Abnormal blink rate detected':  { type: 'blink_anomaly',      detail: 'Unusual blink pattern detected.' },
  'Lighting too dark — face not visible': { type: 'lighting_dark', detail: 'Camera feed too dark to verify candidate.' },
  'Background movement detected':  { type: 'background_motion',  detail: 'Unexpected movement detected in background.' },
  'Identity could not be verified':{ type: 'identity_mismatch',  detail: 'Candidate face does not match registered identity.' },
}

PROCTORING_VIOLATION_MAP['Lighting too dark - face not visible'] = {
  type: 'lighting_dark',
  detail: 'Camera feed too dark to verify candidate.'
}

// Tracks which violation types are currently "active" so we don't spam
// reportViolation on every frame — only fires when a violation first appears
// or re-appears after clearing.
// Track active detector messages so they are only logged when first seen.
const activeViolations = new Set()

function startFrameCapture(video) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  const WS_URL = (window.PROCTOR_WS_URL) || 'ws://localhost:8000/proctor'
  let ws = null
  let intervalId = null
  let hasConnectedOnce = false

  function connect() {
    ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log('[Proctor] WebSocket connected')
      if (hasConnectedOnce) {
        reportViolation(
          'proctor_reconnected',
          'The proctoring connection is active again.',
          'info'
        )
      }

      hasConnectedOnce = true
      intervalId = setInterval(sendFrame, 1000 / 5)
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
            showViolationStatus({
              type: mapped.type,
              detail: mapped.detail,
              severity: 'warning'
            })
            reportViolation(mapped.type, mapped.detail, 'warning')
          } else {
            // Fallback for any new violation type not yet in the map
            showViolationStatus({
              type: 'proctoring_alert',
              detail: message,
              severity: 'warning'
            })
            reportViolation('proctoring_alert', message, 'warning')
          }
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
        setExamStatus('Your camera is connected. You are ready to begin.', 'info')
      }
    }

    ws.onerror = (err) => {
      console.warn('[Proctor] WebSocket error:', err)
    }

    ws.onclose = () => {
      console.warn('[Proctor] WebSocket closed — reconnecting in 3s')
      clearInterval(intervalId)
      if (!examSubmitted && hasConnectedOnce) {
        reportViolation(
          'proctor_connection_lost',
          'The proctoring connection was interrupted and is trying to reconnect.',
          'info'
        )
      }
      // Reconnect unless the exam is already over
      if (!examSubmitted) {
        setTimeout(connect, 3000)
      }
    }
  }

  function sendFrame() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!video.videoWidth) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const frame = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
    ws.send(JSON.stringify({ frame }))
  }

  connect()
}

function startFrameCaptureWithOverlay(video) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  const WS_URL = (window.PROCTOR_WS_URL) || 'ws://localhost:8000/proctor'
  let ws = null
  let intervalId = null
  let reconnectTimeoutId = null
  let hasConnectedOnce = false
  let stopped = false

  setAIProctoringStatus({
    state: 'starting',
    detail: 'Connecting the live feed to AI monitoring...'
  })

  function connect() {
    if (stopped) {
      return
    }

    ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log('[Proctor] WebSocket connected')
      setAIProctoringStatus({
        state: 'running',
        detail: 'AI monitoring is actively checking the live camera feed.'
      })

      if (hasConnectedOnce) {
        reportViolation(
          'proctor_reconnected',
          'The proctoring connection is active again.',
          'info'
        )
      }

      hasConnectedOnce = true
      intervalId = setInterval(sendFrame, 1000 / 5)
    }

    ws.onmessage = (event) => {
      if (!examStarted || examSubmitted) {
        return
      }

      let result
      try {
        result = JSON.parse(event.data)
      } catch {
        return
      }

      const incomingViolations = new Set(result.violations || [])
      setLiveAIWarnings(Array.from(incomingViolations))

      for (const message of incomingViolations) {
        if (!activeViolations.has(message)) {
          const mapped = PROCTORING_VIOLATION_MAP[message]
          if (mapped) {
            showViolationStatus({
              type: mapped.type,
              detail: mapped.detail,
              severity: 'warning'
            })
            reportViolation(mapped.type, mapped.detail, 'warning')
          } else {
            showViolationStatus({
              type: 'proctoring_alert',
              detail: message,
              severity: 'warning'
            })
            reportViolation('proctoring_alert', message, 'warning')
          }

          activeViolations.add(message)
        }
      }

      for (const message of Array.from(activeViolations)) {
        if (!incomingViolations.has(message)) {
          activeViolations.delete(message)
        }
      }

      if (incomingViolations.size === 0) {
        setAIProctoringStatus({
          state: 'running',
          detail: 'AI monitoring is actively checking the live camera feed.'
        })
        setExamStatus('Your camera is connected. You are ready to begin.', 'info')
      }
    }

    ws.onerror = (err) => {
      console.warn('[Proctor] WebSocket error:', err)
    }

    ws.onclose = () => {
      console.warn('[Proctor] WebSocket closed - reconnecting in 3s')
      clearInterval(intervalId)
      intervalId = null
      setLiveAIWarnings([])

      if (!stopped) {
        setAIProctoringStatus({
          state: 'starting',
          detail: 'AI monitoring connection was lost. Reconnecting to the live feed...'
        })
      }

      if (!examSubmitted && hasConnectedOnce) {
        reportViolation(
          'proctor_connection_lost',
          'The proctoring connection was interrupted and is trying to reconnect.',
          'info'
        )
      }

      if (!examSubmitted && !stopped) {
        reconnectTimeoutId = setTimeout(connect, 3000)
      }
    }
  }

  function sendFrame() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!video.videoWidth) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const frame = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
    ws.send(JSON.stringify({ frame }))
  }

  connect()

  return {
    stop() {
      stopped = true
      clearInterval(intervalId)
      clearTimeout(reconnectTimeoutId)
      intervalId = null
      reconnectTimeoutId = null
      activeViolations.clear()
      setLiveAIWarnings([])

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close()
      }

      ws = null
      setAIProctoringStatus({
        state: 'stopped',
        detail: 'AI monitoring stopped for this exam session.'
      })
    }
  }
}


function shouldLogBlockedProcess(processName) {
  const key = String(processName || '').toLowerCase()
  const previousLoggedAt = recentBlockedAppWarnings.get(key) || 0
  const now = Date.now()

  if (now - previousLoggedAt < EXAM_CONFIG.networkAppWarningCooldownMs) {
    return false
  }

  recentBlockedAppWarnings.set(key, now)
  return true
}

function getBlockedShortcutMessage(event) {
  const key = String(event.key || '').toLowerCase()
  const usesPrimaryModifier = event.ctrlKey || event.metaKey

  if (usesPrimaryModifier && key === 'p') {
    return 'Printing is disabled during the exam.'
  }

  if (usesPrimaryModifier && key === 's') {
    return 'Saving shortcuts are disabled during the exam.'
  }

  if (usesPrimaryModifier && key === 'r') {
    return 'Refresh shortcuts are disabled during the exam.'
  }

  if (event.key === 'F5') {
    return 'Refreshing the exam is disabled.'
  }

  if (event.key === 'F11') {
    return 'Fullscreen toggle shortcuts are disabled during the exam.'
  }

  return null
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

  await reportViolation('left_exam_view', 'Candidate left the exam view before completion.', 'warning')
  await submitExam('left_exam')
}

function registerExamGuards() {
  document.addEventListener('contextmenu', event => event.preventDefault())
  document.addEventListener('copy', event => event.preventDefault())
  document.addEventListener('keydown', event => {
    const shortcutMessage = getBlockedShortcutMessage(event)

    if (!shortcutMessage) {
      return
    }

    event.preventDefault()
    showViolationStatus({
      type: 'blocked_shortcut',
      detail: shortcutMessage,
      severity: 'warning'
    })
    reportViolation('blocked_shortcut', `Candidate attempted a blocked shortcut: ${shortcutMessage}`, 'warning')
  })

  window.addEventListener('blur', () => {
    if (!examStarted || examSubmitted || blurViolationLogged) {
      return
    }

    blurViolationLogged = true
    blurEventCount += 1
    const blurSeverity = blurEventCount === 1 ? 'info' : 'warning'
    showViolationStatus({
      type: 'window_blur',
      detail: blurSeverity === 'info'
        ? 'Focus left the exam window once. Please stay on the exam screen.'
        : 'You switched focus away from the exam window.',
      severity: blurSeverity
    })
    reportViolation(
      'window_blur',
      blurSeverity === 'info'
        ? 'Candidate focus left the exam window for the first time.'
        : 'Candidate moved focus away from the exam window.',
      blurSeverity
    )
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
      visibilityEventCount += 1
      const visibilitySeverity = visibilityEventCount === 1 ? 'info' : 'warning'
      showViolationStatus({
        type: 'visibility_hidden',
        detail: visibilitySeverity === 'info'
          ? 'The exam page was hidden once. Please stay on the exam page.'
          : 'You switched away from the exam page.',
        severity: visibilitySeverity
      })
      reportViolation(
        'visibility_hidden',
        visibilitySeverity === 'info'
          ? 'Candidate hid the exam page for the first time.'
          : 'Candidate switched away from the exam page.',
        visibilitySeverity
      )
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

      showViolationStatus({
        type: 'fullscreen_exit',
        detail: 'You exited fullscreen mode during the exam.',
        severity: 'warning'
      })
      reportViolation('fullscreen_exit', 'Candidate exited fullscreen mode during the exam.', 'warning')
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
      showViolationStatus({
        type: 'blocked_network_app',
        detail: `A blocked app was detected and closed automatically: ${blockedList}.`,
        severity: 'warning'
      })
      reportViolation('blocked_network_app', `Detected and closed blocked application(s): ${blockedList}.`, 'warning')
    })
  }

  if (window.electronAPI?.onAIProctoringStatus) {
    window.electronAPI.onAIProctoringStatus(status => {
      setAIProctoringStatus(status)
    })
  }
}

window.addEventListener('beforeunload', () => {
  if (!examSubmitted) {
    reportViolation('page_unload', 'Exam page attempted to unload before submission.', 'warning')
  }

  releaseExamResources()
})

window.addEventListener('load', async () => {
  if (window.electronAPI?.getAIProctoringStatus) {
    const initialAIStatus = await window.electronAPI.getAIProctoringStatus()
    setAIProctoringStatus(initialAIStatus)
  } else {
    renderVideoFeedState()
  }

  registerDevMonitoringControls()
  await loadDevMonitoringSettings()
  registerExamGuards()
  registerAudioUnlockHandlers()
  await unlockAlertAudio()

  if (window.electronAPI?.startFullscreen) {
    window.electronAPI.startFullscreen()
  }

  await loadExam()
})
