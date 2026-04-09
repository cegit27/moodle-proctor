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
let liveUiRefreshTimerId = null
let lastProctorPayloadAt = 0
let aiProctoringStatus = {
  state: 'idle',
  detail: 'Waiting for AI proctoring to start.'
}
let liveAiWarnings = []
let liveAiAdvisories = []
let pinnedExamStatus = null
let webRTCBroadcastState = {
  status: 'idle',
  detail: 'WebRTC broadcast is idle.',
  isConnected: false,
  isProducing: false,
  error: null
}
let teacherBroadcastStartTimeoutId = null

let roomEnrollment = null
let currentExamSettings = {
  enableAiProctoring: true,
  enableManualProctoring: true,
  autoSubmitOnWarningLimit: true,
  captureSnapshots: true,
  allowStudentRejoin: true,
  maxWarnings: 15
}

async function getSafeStorage () {
  const safeStorage = window.electronAPI?.safeStorage

  if (!safeStorage) {
    return null
  }

  try {
    const isEncryptionAvailable = await safeStorage.isEncryptionAvailable()
    return isEncryptionAvailable ? safeStorage : null
  } catch (error) {
    console.error('Failed to access safeStorage availability:', error)
    return null
  }
}

/**
 * Decrypt and retrieve enrollment data from localStorage
 * Handles both encrypted (safeStorage) and unencrypted (legacy) data
 */
async function getRoomEnrollment() {
  const encryptedKey = 'roomEnrollmentEncrypted';
  const legacyKey = 'roomEnrollment';

  try {
    // Try to read and decrypt encrypted data first
    const encryptedData = localStorage.getItem(encryptedKey);
    if (encryptedData) {
      const safeStorage = await getSafeStorage()

      if (safeStorage) {
        const decryptedString = await safeStorage.decryptString(encryptedData);
        return JSON.parse(decryptedString);
      } else {
        // safeStorage not available, can't decrypt
        console.warn('Encrypted data found but safeStorage unavailable');
      }
    }

    // Fallback: try reading unencrypted legacy data
    const legacyData = localStorage.getItem(legacyKey);
    if (legacyData) {
      console.warn('Reading unencrypted enrollment data (should migrate to encrypted)');
      return JSON.parse(legacyData);
    }
  } catch (error) {
    console.error('Error decrypting/parsing room enrollment:', error);
  }

  return null;
}

function clearRoomEnrollment() {
  // Clear both encrypted and unencrypted versions
  localStorage.removeItem('roomEnrollmentEncrypted');
  localStorage.removeItem('roomEnrollment');
  roomEnrollment = null;
}

async function isRoomBasedSession() {
  const enrollment = await getRoomEnrollment();
  return !!enrollment;
}

// Modified fetchWithSession to support room-based enrollment
async function fetchWithSessionOrRoom(url, options = {}) {
  const roomData = await getRoomEnrollment();

  if (roomData) {
    // Room-based session: include room enrollment info in headers
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        'X-Room-Enrollment-Id': roomData.enrollmentId.toString(),
        'X-Room-Id': roomData.roomId.toString(), // Include for signature validation
        'X-Room-Code': roomData.roomCode,
        'X-Student-Email': roomData.studentEmail,
        'X-Room-Enrollment-Signature': roomData.enrollmentSignature || '' // Include signature for validation
      }
    })
    return response
  } else {
    // Traditional authenticated session
    return await fetchWithSession(url, options)
  }
}

function getRoomEnrollmentHeaders(roomData) {
  if (!roomData) {
    return null
  }

  return {
    'X-Room-Enrollment-Id': roomData.enrollmentId.toString(),
    'X-Room-Id': roomData.roomId.toString(),
    'X-Room-Code': roomData.roomCode,
    'X-Student-Email': roomData.studentEmail,
    'X-Room-Enrollment-Signature': roomData.enrollmentSignature || ''
  }
}

async function uploadLiveSnapshot(imageBase64) {
  const roomData = await getRoomEnrollment();

  if (!roomData?.roomCode || !imageBase64) {
    return;
  }

  try {
    await fetchWithSessionOrRoom(
      `${API_BASE_URL}/api/live-monitoring/rooms/${encodeURIComponent(roomData.roomCode)}/frame`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imageBase64,
          mimeType: 'image/jpeg'
        })
      }
    );
  } catch (error) {
    console.warn('[Live Monitoring] Failed to upload snapshot:', error);
  }
}

async function startTeacherWebRTCBroadcast() {
  const roomData = await getRoomEnrollment()

  if (!roomData?.roomCode || !window.electronAPI?.startWebRTCBroadcast) {
    return
  }

  const studentName = roomData.studentName || 'Student'
  const peerId = `room-student-${roomData.roomId}-${roomData.enrollmentId}`

  try {
    await window.electronAPI.startWebRTCBroadcast({
      roomId: roomData.roomCode,
      peerId,
      studentName,
      backendUrl: API_BASE_URL,
      requestHeaders: getRoomEnrollmentHeaders(roomData),
      videoElementId: 'video'
    })
  } catch (error) {
    console.warn('[Live Monitoring] WebRTC broadcast failed to start:', error)
  }
}

const EXAM_CONFIG = {
  maxWarnings: 15,
  networkAppWarningCooldownMs: 5000,
  reconnectCheckIntervalMs: 5000,
  proctorFrameIntervalMs: 125,
  liveSnapshotUploadIntervalMs: 350,
  aiSignalRetryCooldownMs: 1500,
  aiWarningDefaultDwellMs: 0,
  aiAdvisoryDefaultDwellMs: 1500,
  aiWarningDwellMs: {
    'No face detected': 500,
    'Multiple faces detected': 0,
    'Looking away from screen': 0,
    'Phone detected': 0,
    'Forbidden object detected': 0,
    'Identity could not be verified': 1000,
    'Camera may be blocked': 500
  },
  aiAdvisoryDwellMs: {
    'Possible speech activity observed': 1500,
    'Abnormal blink pattern observed': 2000,
    'Lighting too dark for reliable monitoring': 1500,
    'Lighting changed sharply': 1500,
    'Background movement detected': 1500
  }
}

function normalizeWarningLimit (value, fallback = 15) {
  const normalizedValue = Number(value)

  if (Number.isFinite(normalizedValue) && normalizedValue > 0) {
    return normalizedValue
  }

  return fallback
}

function getCurrentWarningLimit () {
  return normalizeWarningLimit(
    currentAttempt?.maxWarnings ||
      currentExamSettings.maxWarnings ||
      EXAM_CONFIG.maxWarnings ||
      15
  )
}

function updateWarningLimitDisplay (limit = getCurrentWarningLimit()) {
  const warningLimitTotalElement = document.getElementById('warningLimitTotal')

  if (!warningLimitTotalElement) {
    return
  }

  warningLimitTotalElement.innerText = `/ ${normalizeWarningLimit(limit)} warnings used`
}

const PROCTOR_FEED_UI = {
  boxClassByState: {
    idle: 'video-box-idle',
    starting: 'video-box-monitoring',
    running: 'video-box-monitoring',
    warning: 'video-box-warning',
    stopped: 'video-box-idle',
    error: 'video-box-error'
  },
  badgeClassByState: {
    idle: 'video-status-badge-idle',
    starting: 'video-status-badge-monitoring',
    running: 'video-status-badge-monitoring',
    warning: 'video-status-badge-warning',
    stopped: 'video-status-badge-idle',
    error: 'video-status-badge-error'
  },
  badgeLabelByState: {
    idle: 'Standby',
    starting: 'Starting',
    running: 'Active',
    warning: 'Warning',
    stopped: 'Stopped',
    error: 'Error'
  },
  headlineByState: {
    idle: 'Waiting',
    starting: 'Connecting',
    running: 'Live',
    warning: 'Warning',
    stopped: 'Stopped',
    error: 'Error'
  }
}
const recentBlockedAppWarnings = new Map()
const PROCTOR_DOCK_POSITION_KEY = 'manual_proctoring.proctorDock.position'
const PROCTOR_DOCK_COLLAPSED_KEY = 'manual_proctoring.proctorDock.collapsed'
const USER_FACING_WARNING_COPY = {
  face_absent: {
    title: 'Warning Issued: Face Not Visible',
    detail:
      'Your face was not clearly visible in the camera. Return fully into frame immediately.'
  },
  multiple_faces: {
    title: 'Warning Issued: Multiple Faces Detected',
    detail:
      'More than one face was visible in the camera. Only the candidate must remain in view.'
  },
  phone_detected: {
    title: 'Warning Issued: Phone Detected',
    detail:
      'A phone was detected in your camera view. Remove it from the exam area immediately.'
  },
  gaze_away: {
    title: 'Warning Issued: Looking Away',
    detail:
      'You looked away from the screen for too long. Face the exam screen and remain focused.'
  },
  lip_movement: {
    title: 'Warning Issued: Talking Detected',
    detail:
      'Talking or repeated lip movement was detected. Stop speaking and continue silently.'
  },
  camera_blocked: {
    title: 'Warning Issued: Camera View Blocked',
    detail:
      'Your camera view may be blocked or unclear. Clear the camera immediately.'
  },
  blink_anomaly: {
    title: 'Warning Issued: Unusual Blink Pattern',
    detail:
      'An unusual blink pattern was detected. Stay focused and keep your face clearly visible.'
  },
  lighting_dark: {
    title: 'Warning Issued: Lighting Too Dark',
    detail:
      'The room is too dark to clearly verify your face. Improve lighting immediately.'
  },
  background_motion: {
    title: 'Warning Issued: Background Movement',
    detail:
      'Unexpected movement was detected in the background. Keep the exam area clear.'
  },
  identity_mismatch: {
    title: 'Warning Issued: Identity Not Verified',
    detail:
      'Your face could not be matched clearly for verification. Stay centered and visible.'
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
    detail:
      'The proctoring connection was interrupted and is trying to reconnect.'
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
  },
  proctoring_advisory: {
    title: 'Monitoring advisory',
    detail: 'A non-critical monitoring advisory was detected during the exam.'
  }
}

function clearPinnedExamStatus () {
  pinnedExamStatus = null
}

function setExamStatus (message, type = 'info', options = {}) {
  const status = document.getElementById('examMessage')

  if (!status) {
    return
  }

  const shouldPin =
    options.pin !== undefined ? Boolean(options.pin) : type === 'error'

  if (options.clearPinnedWarning) {
    clearPinnedExamStatus()
  }

  if (shouldPin && message) {
    pinnedExamStatus = { message, type }
  }

  const nextStatus =
    !shouldPin && pinnedExamStatus && !options.force
      ? pinnedExamStatus
      : { message, type }

  status.hidden = !nextStatus.message
  status.className = `status-message ${nextStatus.type || 'info'}`
  status.innerText = nextStatus.message || ''
}

function formatDuration (totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function updateViolationCount (count) {
  const normalizedCount = Number(count || 0)
  const violationCountElement = document.getElementById('violationCount')
  const warningProgressElement = document.getElementById('warningProgress')

  updateWarningLimitDisplay()

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

function formatViolationTimestamp (timestamp) {
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

function escapeHtml (value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatLiveUpdateLabel () {
  if (!lastProctorPayloadAt) {
    return 'Waiting'
  }

  const secondsAgo = Math.max(
    0,
    Math.round((Date.now() - lastProctorPayloadAt) / 1000)
  )

  if (secondsAgo <= 1) {
    return 'Just now'
  }

  return `${secondsAgo}s ago`
}

function resetLiveMonitoringState () {
  lastProctorPayloadAt = 0
  activeViolations.clear()
  pendingAiViolations.clear()
  activeAiAdvisories.clear()
  pendingAiAdvisories.clear()
  reportingAiViolations.clear()
  reportingAiAdvisories.clear()
  aiSignalRetryAt.clear()
  setLiveAIWarnings([], [])
}

function startLiveUiRefreshLoop () {
  if (liveUiRefreshTimerId) {
    return
  }

  liveUiRefreshTimerId = setInterval(() => {
    renderVideoFeedState()
    renderTopWarningBanner()
  }, 1000)
}

function clampProctorDockPosition (x, y, dock) {
  const panel = dock || document.getElementById('proctorDock')

  if (!panel) {
    return { x: 0, y: 0 }
  }

  const margin = 12
  const maxX = Math.max(margin, window.innerWidth - panel.offsetWidth - margin)
  const maxY = Math.max(
    margin,
    window.innerHeight - panel.offsetHeight - margin
  )

  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY)
  }
}

function applyProctorDockPosition (x, y) {
  const dock = document.getElementById('proctorDock')

  if (!dock) {
    return
  }

  const next = clampProctorDockPosition(x, y, dock)
  dock.style.left = `${next.x}px`
  dock.style.top = `${next.y}px`
  dock.style.right = 'auto'
  dock.style.bottom = 'auto'
}

function initializeProctorDock () {
  const dock = document.getElementById('proctorDock')
  const handle = document.getElementById('proctorDockHandle')
  const toggle = document.getElementById('proctorDockToggle')

  if (!dock || !handle || !toggle) {
    return
  }

  const savedCollapsed =
    window.localStorage.getItem(PROCTOR_DOCK_COLLAPSED_KEY) === 'true'
  dock.classList.toggle('is-collapsed', savedCollapsed)
  toggle.innerText = savedCollapsed ? 'Expand' : 'Minimize'
  toggle.setAttribute('aria-expanded', String(!savedCollapsed))

  requestAnimationFrame(() => {
    try {
      const savedPosition = JSON.parse(
        window.localStorage.getItem(PROCTOR_DOCK_POSITION_KEY) || 'null'
      )
      if (
        savedPosition &&
        Number.isFinite(savedPosition.x) &&
        Number.isFinite(savedPosition.y)
      ) {
        applyProctorDockPosition(savedPosition.x, savedPosition.y)
        return
      }
    } catch {}

    const defaultX = window.innerWidth - dock.offsetWidth - 24
    const defaultY = window.innerHeight - dock.offsetHeight - 24
    applyProctorDockPosition(defaultX, defaultY)
  })

  toggle.addEventListener('click', () => {
    const isCollapsed = dock.classList.toggle('is-collapsed')
    toggle.innerText = isCollapsed ? 'Expand' : 'Minimize'
    toggle.setAttribute('aria-expanded', String(!isCollapsed))
    window.localStorage.setItem(PROCTOR_DOCK_COLLAPSED_KEY, String(isCollapsed))

    requestAnimationFrame(() => {
      const rect = dock.getBoundingClientRect()
      applyProctorDockPosition(rect.left, rect.top)
    })
  })

  let dragState = null

  handle.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) {
      return
    }

    const rect = dock.getBoundingClientRect()
    dragState = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    }

    dock.classList.add('is-dragging')
    handle.setPointerCapture(event.pointerId)
  })

  handle.addEventListener('pointermove', event => {
    if (!dragState) {
      return
    }

    applyProctorDockPosition(
      event.clientX - dragState.offsetX,
      event.clientY - dragState.offsetY
    )
  })

  const finishDrag = event => {
    if (!dragState) {
      return
    }

    const rect = dock.getBoundingClientRect()
    window.localStorage.setItem(
      PROCTOR_DOCK_POSITION_KEY,
      JSON.stringify({ x: rect.left, y: rect.top })
    )

    dragState = null
    dock.classList.remove('is-dragging')

    if (
      event?.pointerId !== undefined &&
      handle.hasPointerCapture(event.pointerId)
    ) {
      handle.releasePointerCapture(event.pointerId)
    }
  }

  handle.addEventListener('pointerup', finishDrag)
  handle.addEventListener('pointercancel', finishDrag)

  window.addEventListener('resize', () => {
    const rect = dock.getBoundingClientRect()
    applyProctorDockPosition(rect.left, rect.top)
  })
}

function getUserFacingWarningCopy (violation = {}) {
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

function getNormalizedProctorFeedState () {
  const hasWarnings = liveAiWarnings.length > 0
  const hasAdvisories = liveAiAdvisories.length > 0

  return {
    warningCount: liveAiWarnings.length,
    advisoryCount: liveAiAdvisories.length,
    hasWarnings,
    hasAdvisories,
    normalizedState: hasWarnings
      ? 'warning'
      : hasAdvisories
      ? 'running'
      : aiProctoringStatus.state || 'idle'
  }
}

function renderVideoFeedState () {
  const videoBox = document.getElementById('proctorVideoBox')
  const statusText = document.getElementById('videoAiStatusText')
  const statusBadge = document.getElementById('videoAiStatusBadge')
  const statusHeadline = document.getElementById('videoAiStatusHeadline')
  const warningCount = document.getElementById('videoWarningCount')
  const updated = document.getElementById('liveWarningBannerUpdated')
  const warningStack = document.getElementById('videoWarningStack')

  if (
    !videoBox ||
    !statusText ||
    !statusBadge ||
    !statusHeadline ||
    !warningCount ||
    !updated ||
    !warningStack
  ) {
    return
  }

  const {
    warningCount: warningCountValue,
    advisoryCount: advisoryCountValue,
    hasWarnings,
    hasAdvisories,
    normalizedState
  } = getNormalizedProctorFeedState()

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

  videoBox.classList.add(
    PROCTOR_FEED_UI.boxClassByState[normalizedState] || 'video-box-idle'
  )
  statusBadge.classList.add(
    PROCTOR_FEED_UI.badgeClassByState[normalizedState] ||
      'video-status-badge-idle'
  )
  statusBadge.innerText =
    PROCTOR_FEED_UI.badgeLabelByState[normalizedState] || 'Idle'
  statusHeadline.innerText =
    PROCTOR_FEED_UI.headlineByState[normalizedState] || 'Waiting'
  updated.innerText = `Updated ${formatLiveUpdateLabel()}`
  warningCount.innerText =
    hasWarnings || hasAdvisories
      ? `${warningCountValue + advisoryCountValue} item${
          warningCountValue + advisoryCountValue > 1 ? 's' : ''
        }`
      : lastProctorPayloadAt
      ? 'Feed clear'
      : 'Waiting'

  if (hasWarnings) {
    const primaryWarning = liveAiWarnings[0]
    statusText.innerText = primaryWarning
    warningStack.innerHTML = liveAiWarnings
      .slice(0, 3)
      .map(
        warning =>
          `<div class="video-warning-pill video-warning-pill-warning">${escapeHtml(
            warning
          )}</div>`
      )
      .join('')
    return
  }

  if (hasAdvisories) {
    statusText.innerText =
      'Monitoring is active. Keep the user visible and centered.'
    warningStack.innerHTML = liveAiAdvisories
      .slice(0, 2)
      .map(
        advisory =>
          `<div class="video-warning-pill video-warning-pill-info">${escapeHtml(
            advisory
          )}</div>`
      )
      .join('')
    return
  }

  statusText.innerText = lastProctorPayloadAt
    ? 'Monitoring is active and the feed is clear.'
    : 'Waiting for live feed...'
  warningStack.innerHTML =
    '<div class="video-warning-pill video-warning-pill-neutral">Live feed is clear</div>'
}

function renderTopWarningBanner () {
  const banner = document.getElementById('liveWarningBanner')
  const badge = document.getElementById('liveWarningBannerBadge')
  const title = document.getElementById('liveWarningBannerTitle')
  const text = document.getElementById('liveWarningBannerText')
  const count = document.getElementById('liveWarningBannerCount')
  const state = document.getElementById('liveWarningBannerState')
  const updated = document.getElementById('liveWarningBannerUpdated')
  const list = document.getElementById('liveWarningBannerList')

  if (
    !banner ||
    !badge ||
    !title ||
    !text ||
    !count ||
    !state ||
    !updated ||
    !list
  ) {
    return
  }

  const warningCount = liveAiWarnings.length
  const advisoryCount = liveAiAdvisories.length
  const totalActive = warningCount + advisoryCount

  banner.classList.remove(
    'live-warning-banner-idle',
    'live-warning-banner-warning',
    'live-warning-banner-error'
  )
  badge.classList.remove(
    'live-warning-badge-idle',
    'live-warning-badge-warning',
    'live-warning-badge-error'
  )

  const mode = warningCount > 0 ? 'error' : totalActive > 0 ? 'warning' : 'idle'
  banner.classList.add(`live-warning-banner-${mode}`)
  badge.classList.add(`live-warning-badge-${mode}`)

  badge.innerText =
    mode === 'error'
      ? 'Action Needed'
      : mode === 'warning'
      ? 'Advisory'
      : 'Stable'
  count.innerText = String(totalActive)
  state.innerText = lastProctorPayloadAt ? 'Live' : 'Connecting'
  updated.innerText = formatLiveUpdateLabel()

  if (warningCount > 0) {
    title.innerText = `${warningCount} live warning${
      warningCount > 1 ? 's' : ''
    } detected`
    text.innerText =
      'The live AI feed is currently detecting issues that may become recorded exam violations if they continue.'
  } else if (advisoryCount > 0) {
    title.innerText = `${advisoryCount} monitoring advisory${
      advisoryCount > 1 ? 'ies' : ''
    } visible`
    text.innerText =
      'These advisories are informational signals from the live feed. Review them and keep the candidate properly positioned and visible.'
  } else {
    title.innerText = lastProctorPayloadAt
      ? 'Live monitoring is active'
      : 'Connecting live monitoring'
    text.innerText = lastProctorPayloadAt
      ? `The live feed is updating normally. Last update: ${formatLiveUpdateLabel()}.`
      : aiProctoringStatus.detail ||
        'AI monitoring is connecting to the live feed.'
  }

  const pills = [
    ...liveAiWarnings.map(message => ({ message, cls: 'error' })),
    ...liveAiAdvisories.map(message => ({ message, cls: 'warning' }))
  ].slice(0, 5)

  list.innerHTML = pills.length
    ? pills
        .map(
          item =>
            `<div class="live-warning-banner-pill live-warning-banner-pill-${
              item.cls
            }">${escapeHtml(item.message)}</div>`
        )
        .join('')
    : '<div class="live-warning-banner-pill live-warning-banner-pill-neutral">No live warnings</div>'
}

function setLiveAIWarnings (warnings = [], advisories = []) {
  liveAiWarnings = Array.isArray(warnings)
    ? warnings.filter(Boolean).slice(0, 3)
    : []
  liveAiAdvisories = Array.isArray(advisories)
    ? advisories.filter(Boolean).slice(0, 2)
    : []
  renderVideoFeedState()
  renderTopWarningBanner()
}

function setAIProctoringStatus (status = {}) {
  aiProctoringStatus = {
    state: status.state || 'idle',
    detail: status.detail || 'AI proctoring status is unavailable.'
  }
  renderVideoFeedState()
  renderTopWarningBanner()
}

function showViolationStatus (violation = {}) {
  const warningCopy = getUserFacingWarningCopy(violation)
  const severity = violation.severity === 'info' ? 'info' : 'error'
  const prefix = severity === 'error' ? 'Exam warning recorded. ' : ''
  setExamStatus(`${prefix}${warningCopy.title}. ${warningCopy.detail}`, severity)
}

function renderDevMonitoringState (settings = {}) {
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

async function loadDevMonitoringSettings () {
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

function registerDevMonitoringControls () {
  const toggle = document.getElementById('devBlockedAppToggle')

  if (!toggle || !window.electronAPI?.setBlockedAppMonitoringEnabled) {
    return
  }

  toggle.addEventListener('change', async () => {
    try {
      const settings = await window.electronAPI.setBlockedAppMonitoringEnabled(
        toggle.checked
      )
      renderDevMonitoringState(settings)
    } catch (error) {
      toggle.checked = blockedAppMonitoringEnabled
      console.error('Failed to update blocked app monitoring setting:', error)
    }
  })
}

function renderWarningHistory (violations = []) {
  const historyList = document.getElementById('warningHistoryList')

  if (!historyList) {
    return
  }

  const recentViolations = Array.isArray(violations)
    ? violations.slice(0, 5)
    : []

  if (recentViolations.length === 0) {
    historyList.innerHTML =
      '<li class="empty-list-message">No warnings recorded yet.</li>'
    return
  }

  historyList.innerHTML = recentViolations
    .map(violation => {
      const warningCopy = getUserFacingWarningCopy(violation)
      const detail = escapeHtml(warningCopy.detail)
      const type = escapeHtml(warningCopy.title)
      const timestamp = escapeHtml(
        formatViolationTimestamp(violation.createdAt)
      )
      const severityLabel = escapeHtml(
        violation.severity === 'info' ? 'Info' : 'Warning'
      )

      return `
        <li class="summary-card">
          <div class="summary-card-meta">${timestamp} · ${severityLabel}</div>
          <div class="summary-card-title">${type}</div>
          <div class="summary-card-detail">${detail}</div>
        </li>
      `
    })
    .join('')
}

function renderQuestionSummary (questions = []) {
  const questionList = document.getElementById('questionSummaryList')

  if (!questionList) {
    return
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    questionList.innerHTML =
      '<li class="empty-list-message">No question summary is available.</li>'
    return
  }

  questionList.innerHTML = questions
    .map(question => {
      const rawQuestionText = String(question.question || 'Untitled question')
      const normalizedQuestionText = rawQuestionText
        .replace(/\s*\(question paper PDF\)\s*$/i, '')
        .trim()
      const isDocumentOnlyQuestion =
        Array.isArray(question.options) &&
        question.options.length === 0 &&
        /\(question paper PDF\)\s*$/i.test(rawQuestionText)
      const questionText = escapeHtml(
        isDocumentOnlyQuestion
          ? 'Question paper PDF'
          : normalizedQuestionText || 'Untitled question'
      )
      const options = Array.isArray(question.options) ? question.options : []

      const optionMarkup =
        isDocumentOnlyQuestion
          ? '<li class="summary-card-detail">Read the complete question paper on the left and answer from that document.</li>'
          : options.length === 0
          ? '<li class="summary-card-detail">This question has no listed options.</li>'
          : options
              .map(
                option =>
                  `<li class="summary-card-detail">${escapeHtml(option)}</li>`
              )
              .join('')

      return `
        <li class="summary-card">
          <div class="summary-card-title" style="margin-bottom: 8px;">${questionText}</div>
          <ul class="summary-option-list">
            ${optionMarkup}
          </ul>
        </li>
      `
    })
    .join('')
}

async function loadQuestionSummary () {
  try {
    const response = await fetchWithSessionOrRoom(`${API_BASE_URL}/api/questions`)

    if (!response) {
      markBackendDisconnected(
        'We could not load the question summary. Trying to reconnect...'
      )
      return false
    }

    if (!response.ok) {
      throw new Error('Question summary request failed')
    }

    const data = await response.json()
    renderQuestionSummary(data)
    return true
  } catch (error) {
    markBackendDisconnected(
      'We could not load the question summary. Trying to reconnect...'
    )
    throw error
  }
}

function ensureAudioContext () {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return null
  }

  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    audioContext = new AudioContextClass()
  }

  return audioContext
}

async function unlockAlertAudio () {
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

function registerAudioUnlockHandlers () {
  const unlock = () => {
    unlockAlertAudio()
  }

  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock, { passive: true })
}

function playWarningBeep () {
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

function renderExamHeader (student) {
  document.getElementById('examStudentName').innerText = student.name
  document.getElementById('examStudentEmail').innerText = student.email

  // Handle room-based sessions
  if (student.roomCode) {
    // For room-based sessions, show examName and roomCode
    document.getElementById('examTitle').innerText = `${student.examName} (Room: ${student.roomCode})`
  } else {
    // Traditional sessions
    document.getElementById('examTitle').innerText = student.exam
  }
}

function updateSubmissionButton (isDisabled, label = 'Submit Exam') {
  const submitButton = document.getElementById('submitExamButton')

  if (!submitButton) {
    return
  }

  submitButton.disabled = isDisabled
  submitButton.innerText = label
}

function setNavigationButtonsDisabled (isDisabled) {
  const buttons = document.querySelectorAll('.secondary-btn')
  buttons.forEach(button => {
    button.disabled = isDisabled
  })
}

function clearReconnectCheck () {
  if (!reconnectCheckTimerId) {
    return
  }

  clearInterval(reconnectCheckTimerId)
  reconnectCheckTimerId = null
}

function setBackendDisconnectedState (isDisconnected, message) {
  backendDisconnected = isDisconnected

  if (isDisconnected) {
    updateSubmissionButton(true, 'Backend Offline')
    setNavigationButtonsDisabled(true)
    setExamStatus(
      message ||
        'Connection to the exam server was lost. We will keep trying to reconnect.',
      'error'
    )
    return
  }

  setNavigationButtonsDisabled(false)
  updateSubmissionButton(
    examSubmitted || isSubmitting,
    examSubmitted ? 'Submitted' : 'Submit Exam'
  )
  setExamStatus(
    message || 'Connection restored. You can continue your exam.',
    'info'
  )
}

async function checkBackendConnection () {
  const response = await fetchWithSessionOrRoom(`${API_BASE_URL}/api/session`)

  if (!response) {
    markBackendDisconnected(
      'We could not start the exam right now. Trying to reconnect...'
    )
    return false
  }

  return response.ok
}

function startReconnectChecks () {
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
      setBackendDisconnectedState(
        false,
        'Connection restored. You can continue your exam.'
      )
    } catch (error) {
      console.error('Reconnect check failed:', error)
    }
  }, EXAM_CONFIG.reconnectCheckIntervalMs)
}

function markBackendDisconnected (message) {
  setBackendDisconnectedState(true, message)
  startReconnectChecks()
}

function releaseExamResources () {
  if (examTimerId) {
    clearInterval(examTimerId)
    examTimerId = null
  }

  if (liveUiRefreshTimerId) {
    clearInterval(liveUiRefreshTimerId)
    liveUiRefreshTimerId = null
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

  if (teacherBroadcastStartTimeoutId) {
    clearTimeout(teacherBroadcastStartTimeoutId)
    teacherBroadcastStartTimeoutId = null
  }

  if (window.electronAPI?.stopWebRTCBroadcast) {
    window.electronAPI.stopWebRTCBroadcast().catch(error => {
      console.warn('Failed to stop WebRTC broadcast:', error)
    })
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
  resetLiveMonitoringState()
}

function formatCompletionLabel (value, fallback = 'Not available') {
  if (!value) {
    return fallback
  }

  return String(value)
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatCompletionTimestamp (timestamp) {
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

function normalizeCompletionAttempt (reason, attempt = currentAttempt) {
  const nextAttempt =
    attempt && typeof attempt === 'object'
      ? {
          ...attempt
        }
      : {}

  if (!nextAttempt.submissionReason) {
    nextAttempt.submissionReason = reason
  }

  if (!nextAttempt.submittedAt) {
    nextAttempt.submittedAt = Date.now()
  }

  return nextAttempt
}

function storeLocalUploadSession (session) {
  if (!session || typeof session !== 'object') {
    return false
  }

  try {
    localStorage.setItem('postExamUploadSession', JSON.stringify(session))
    return true
  } catch (error) {
    console.warn('Failed to store local upload session fallback:', error)
    return false
  }
}

function formatDiagnosticValue (value) {
  if (value === null || value === undefined || value === '') {
    return 'n/a'
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch (error) {
      return String(value)
    }
  }

  return String(value)
}

function buildUploadDebugMarkup (uploadDiagnostics = null) {
  if (!uploadDiagnostics || typeof uploadDiagnostics !== 'object') {
    return ''
  }

  const entries = Object.entries(uploadDiagnostics)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `<div><strong>${escapeHtml(key)}:</strong> <pre style="margin: 4px 0 0; white-space: pre-wrap; word-break: break-word; font: 12px/1.4 Consolas, monospace;">${escapeHtml(formatDiagnosticValue(value))}</pre></div>`
    )
    .join('')

  if (!entries) {
    return ''
  }

  return `
    <details style="margin-top: 16px; text-align: left;">
      <summary style="cursor: pointer; font-weight: 600; color: #475467;">Upload handoff debug details</summary>
      <div style="margin-top: 12px; display: grid; gap: 10px;">
        ${entries}
      </div>
    </details>
  `
}

function renderCompletionScreen (
  reasonLabel,
  attempt = {},
  uploadError = '',
  uploadDiagnostics = null
) {
  const warningCount = Number(attempt.violationCount || 0)
  const maxWarnings = normalizeWarningLimit(
    attempt.maxWarnings,
    getCurrentWarningLimit()
  )
  const submissionReason = formatCompletionLabel(
    attempt.submissionReason,
    formatCompletionLabel(reasonLabel, 'Completed')
  )
  const submittedAt = formatCompletionTimestamp(attempt.submittedAt)
  const shouldContactInvigilator = [
    'left_exam',
    'warning_limit_reached'
  ].includes(attempt.submissionReason)
  const uploadErrorMarkup = uploadError
    ? `
        <div style="margin-top: 18px; padding: 14px 16px; border-radius: 12px; background: #fef3f2; color: #b42318; text-align: left;">
          <strong>Answer-sheet upload handoff failed.</strong>
          <div style="margin-top: 6px;">${escapeHtml(uploadError)}</div>
          ${buildUploadDebugMarkup(uploadDiagnostics)}
        </div>
      `
    : ''

  document.body.innerHTML = `
    <div class="completion-screen">
      <div class="completion-card">
        <h1>Exam Submitted</h1>
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
          ${
            shouldContactInvigilator
              ? 'If you need help with this submission, please contact the invigilator or teacher.'
              : 'If you need help, please contact the invigilator or teacher.'
          }
        </p>
        ${uploadErrorMarkup}
      </div>
    </div>
  `
}

function finishExamUI (reason, uploadError = '', uploadDiagnostics = null) {
  examSubmitted = true
  releaseExamResources()

  const completionAttempt = normalizeCompletionAttempt(reason)
  currentAttempt = completionAttempt

  const messageByReason = {
    manual_submit: 'Your exam has been submitted successfully.',
    timer_expired: 'Time is up. Your exam was submitted automatically.',
    left_exam: 'You left the exam, so your attempt was submitted automatically.',
    warning_limit_reached: `The exam was terminated permanently after reaching ${getCurrentWarningLimit()} warnings.`
  }

  renderCompletionScreen(
    messageByReason[reason] || 'Your exam session has ended.',
    completionAttempt,
    uploadError,
    uploadDiagnostics
  )
}

async function openPostExamUploadHandoff (reason = 'manual_submit') {
  examSubmitted = true
  currentAttempt = normalizeCompletionAttempt(reason)
  const uploadResult = await createAnswerSheetUploadSession(reason)

  if (window.electronAPI?.openScanner && uploadResult.session) {
    releaseExamResources()
    window.electronAPI.openScanner(uploadResult.session)
    return true
  }

  if (uploadResult.session) {
    const storedLocally = storeLocalUploadSession(uploadResult.session)

    if (storedLocally) {
      releaseExamResources()
      window.location = 'upload-session.html'
      return true
    }
  }

  const uploadDiagnostics = {
    stage: window.electronAPI?.openScanner
      ? 'electron_open_scanner_failed_after_session_create'
      : 'electron_api_missing',
    hasElectronApi: Boolean(window.electronAPI),
    hasOpenScanner: Boolean(window.electronAPI?.openScanner),
    sessionCreated: Boolean(uploadResult.session),
    sessionToken: uploadResult.session?.token || null,
    mobileEntryUrl: uploadResult.session?.mobileEntryUrl || null,
    localSessionStored: Boolean(uploadResult.session && storeLocalUploadSession(uploadResult.session)),
    ...(uploadResult.diagnostics || {})
  }

  finishExamUI(
    reason,
    uploadResult.error ||
      'We could not prepare the QR handoff for answer-sheet upload.',
    uploadDiagnostics
  )
  return false
}

async function createAnswerSheetUploadSession (submissionReason = 'manual_submit') {
  const attemptId = Number(currentAttempt?.id || 0) || undefined
  const isRoomSession = await isRoomBasedSession()
  const diagnostics = {
    stage: 'create_scan_session_request',
    apiBaseUrl: API_BASE_URL,
    attemptId: attemptId || null,
    submissionReason,
    isRoomSession,
    hasElectronApi: Boolean(window.electronAPI),
    hasOpenScanner: Boolean(window.electronAPI?.openScanner)
  }

  try {
    const response = await fetchWithSessionOrRoom(`${API_BASE_URL}/api/scan/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        attemptId,
        submissionReason,
        source: 'electron_post_exam'
      })
    })

    if (!response) {
      return {
        session: null,
        error: 'The exam session is no longer authenticated.',
        diagnostics: {
          ...diagnostics,
          stage: 'scan_session_no_response'
        }
      }
    }

    const rawBody = await response.text()
    let data = {}

    if (rawBody) {
      try {
        data = JSON.parse(rawBody)
      } catch (parseError) {
        throw new Error(
          rawBody.trim() ||
            'The server returned an unreadable response while creating the upload session.'
        )
      }
    }

    const nextDiagnostics = {
      ...diagnostics,
      responseStatus: response.status,
      responseOk: response.ok,
      responseUrl: response.url,
      responseBodyPreview: rawBody ? rawBody.slice(0, 1200) : '(empty)',
      responseSuccess: Boolean(data.success),
      responseError: data.error || data.message || null,
      responseHasData: Boolean(data.data || data.session),
      responseKeys: Object.keys(data || {}),
      backendDebug: data.debug || null
    }

    if (!response.ok || !data.success) {
      return {
        session: null,
        error:
          data.error ||
          data.message ||
          'We could not prepare the answer sheet upload session.',
        diagnostics: nextDiagnostics
      }
    }

    const session = data.data || data.session || null

    if (session && typeof session === 'object') {
      session.backendApiBaseUrl = API_BASE_URL
    }

    return {
      session,
      error: session ? null : 'The server reported success but did not return a scan session.',
      diagnostics: nextDiagnostics
    }
  } catch (error) {
    console.error('Failed to create answer sheet upload session:', error)
    return {
      session: null,
      error:
        error instanceof Error && error.message
          ? error.message
          : 'We could not prepare the answer sheet upload session.',
      diagnostics: {
        ...diagnostics,
        stage: 'scan_session_exception',
        exceptionName: error instanceof Error ? error.name : typeof error,
        exceptionMessage:
          error instanceof Error ? error.message : String(error || 'Unknown error')
      }
    }
  }
}


async function reportViolation (type, detail, severity = 'warning') {
  if (!examStarted || examSubmitted) {
    return false
  }

  try {
    const attemptId = Number(currentAttempt?.id || 0) || undefined
    const response = await fetchWithSessionOrRoom(
      `${API_BASE_URL}/api/exam/violations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          attemptId,
          type,
          violationType: type,
          detail,
          severity,
          timestamp: Date.now()
        })
      }
    )

    if (!response) {
      markBackendDisconnected(
        'We could not reach the exam server while recording this event. Trying to reconnect...'
      )
      return false
    }

    const data = await response.json()

    if (!response.ok) {
      throw new Error(
        data.error ||
          data.message ||
          `The server rejected the warning request (${response.status}).`
      )
    }

    const responseAttempt = data.attempt || data.data?.attempt || null
    const responseViolation = data.violation || data.data?.violation || null
    const responseViolationCount = data.data?.violationCount
    let nextAttempt =
      responseAttempt && typeof responseAttempt === 'object'
        ? {
            ...(currentAttempt || {}),
            ...responseAttempt
          }
        : currentAttempt
        ? { ...currentAttempt }
        : null

    if (nextAttempt && responseViolationCount !== undefined) {
      nextAttempt.violationCount = Number(responseViolationCount || 0)
    }

    if (nextAttempt && responseViolation) {
      const normalizedViolation = {
        type:
          responseViolation.type ||
          responseViolation.violationType ||
          type,
        detail: responseViolation.detail || detail,
        severity: responseViolation.severity || severity,
        createdAt: responseViolation.createdAt
          ? Number(responseViolation.createdAt)
          : responseViolation.occurredAt
          ? new Date(responseViolation.occurredAt).getTime()
          : Date.now()
      }

      const existingViolations = Array.isArray(nextAttempt.violations)
        ? nextAttempt.violations
        : []
      const isDuplicate = existingViolations.some(
        violation =>
          violation.type === normalizedViolation.type &&
          violation.detail === normalizedViolation.detail &&
          Number(violation.createdAt || 0) ===
            Number(normalizedViolation.createdAt || 0)
      )

      nextAttempt.violations = isDuplicate
        ? existingViolations
        : [normalizedViolation, ...existingViolations]
    }

    if (!nextAttempt) {
      throw new Error('The server did not return the updated exam attempt state.')
    }

    if (backendDisconnected) {
      clearReconnectCheck()
      setBackendDisconnectedState(
        false,
        'Connection restored. Your exam is back online.'
      )
    }
    currentAttempt = nextAttempt
    updateViolationCount(nextAttempt.violationCount)
    renderWarningHistory(nextAttempt.violations)
    if (severity === 'warning') {
      playWarningBeep()
    }

    if (nextAttempt.status === 'submitted') {
      setExamStatus(
        data.message ||
          `Exam terminated after reaching ${getCurrentWarningLimit()} warnings.`,
        'error'
      )
      await openPostExamUploadHandoff(
        nextAttempt.submissionReason || 'warning_limit_reached'
      )
    } else {
      showViolationStatus({ type, detail, severity })
    }
    return true
  } catch (error) {
    console.error('Failed to report violation:', error)
    const errorMessage =
      error instanceof Error && error.message
        ? error.message
        : 'The warning could not be recorded.'

    if (error instanceof TypeError) {
      markBackendDisconnected(
        'We could not reach the exam server while recording this event. Trying to reconnect...'
      )
      return false
    }

    setExamStatus(
      `The warning could not be recorded: ${errorMessage}`,
      'error',
      { pin: true }
    )
    return false
  }
}

function startTimer (totalSeconds) {
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

async function loadQuestionPaper (questionPaperName) {
  const response = await fetchWithSessionOrRoom(
    `${API_BASE_URL}/files/${questionPaperName}`
  )

  if (!response) {
    markBackendDisconnected(
      'We could not load the question paper. Trying to reconnect...'
    )
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

async function startExamAttempt () {
  const response = await fetchWithSessionOrRoom(`${API_BASE_URL}/api/exam/start`, {
    method: 'POST'
  })

  if (!response) {
    markBackendDisconnected(
      'We could not start the exam right now. Trying to reconnect...'
    )
    return false
  }

  const data = await response.json()

  if (!response.ok || !data.success) {
    setExamStatus(data.message || 'Could not start this exam.', 'error')
    return false
  }

  currentAttempt =
    data.attempt && typeof data.attempt === 'object'
      ? {
          ...(currentAttempt || {}),
          ...data.attempt
        }
      : currentAttempt
  if (backendDisconnected) {
    clearReconnectCheck()
    setBackendDisconnectedState(
      false,
      'Connection restored. You can continue your exam.'
    )
  }
  updateWarningLimitDisplay(currentAttempt?.maxWarnings)
  updateViolationCount(currentAttempt?.violationCount)
  renderWarningHistory(currentAttempt?.violations)
  examStarted = true
  resetLiveMonitoringState()
  setAIProctoringStatus({
    state: 'running',
    detail: 'Live monitoring is active for this exam session.'
  })

  if (window.electronAPI?.startExamMonitoring) {
    window.electronAPI.startExamMonitoring()
  }

  return true
}

async function loadExam () {
    setExamStatus('Loading your exam...', 'info')

  try {
    const response = await fetchWithSessionOrRoom(`${API_BASE_URL}/api/exam`)

    if (!response) {
      markBackendDisconnected(
        'We could not load your exam. Trying to reconnect...'
      )
      return
    }

    const data = await response.json()

    if (!response.ok || !data.success) {
      setExamStatus('We could not load your exam right now.', 'error')
      return
    }

    if (data.attempt?.status === 'submitted') {
      currentAttempt =
        data.attempt && typeof data.attempt === 'object'
          ? {
              ...(currentAttempt || {}),
              ...data.attempt
            }
          : normalizeCompletionAttempt('manual_submit')
      await openPostExamUploadHandoff(
        data.attempt.submissionReason || 'manual_submit'
      )
      return
    }

    currentExamSettings = {
      ...currentExamSettings,
      ...(data.settings || {})
    }

    currentAttempt =
      data.attempt && typeof data.attempt === 'object'
        ? {
            ...(currentAttempt || {}),
            ...data.attempt
          }
        : currentAttempt
    updateWarningLimitDisplay()

    // Render header with room info or student info
    if (await isRoomBasedSession()) {
      const roomData = await getRoomEnrollment();
      renderExamHeader({
        name: roomData.studentName,
        email: roomData.studentEmail,
        examName: roomData.examName,
        courseName: roomData.courseName,
        roomCode: roomData.roomCode
      })
    } else {
      renderExamHeader(data.student)
    }

    updateViolationCount(currentAttempt?.violationCount)
    renderWarningHistory(currentAttempt?.violations)

    const cameraReady = await startCamera()

    if (!cameraReady) {
      updateSubmissionButton(true, 'Blocked')
      return
    }

    const started = await startExamAttempt()

    if (!started) {
      return
    }

    if (window.electronAPI?.startFullscreen) {
      window.electronAPI.startFullscreen()
    }

    startTimer(data.timerSeconds)
    const paperLoaded = await loadQuestionPaper(data.questionPaper)

    if (!paperLoaded) {
      return
    }

    await loadQuestionSummary()
    setExamStatus('Your exam is ready. You may begin now.', 'info')
  } catch (error) {
    console.error('Error loading exam:', error)
    markBackendDisconnected(
      'We could not connect to the exam server. Trying to reconnect...'
    )
  }
}

async function submitExam (reason = 'manual_submit') {
  if (examSubmitted || isSubmitting) {
    return
  }

  isSubmitting = true
  updateSubmissionButton(true, 'Submitting...')
  setExamStatus('Submitting your exam. Please wait...', 'info', {
    force: true,
    clearPinnedWarning: true
  })

  try {
    const response = await fetchWithSessionOrRoom(`${API_BASE_URL}/api/exam/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    })

    if (!response) {
      markBackendDisconnected(
        'We could not reach the exam server to submit your exam. Trying to reconnect...'
      )
      return
    }

    const data = await response.json()

    if (!response.ok || !data.success) {
      setExamStatus(
        data.message || 'We could not submit your exam right now.',
        'error'
      )
      return
    }

    currentAttempt =
      data.attempt && typeof data.attempt === 'object'
        ? {
            ...(currentAttempt || {}),
            ...data.attempt
          }
        : normalizeCompletionAttempt(reason)

    if (!currentAttempt.submissionReason) {
      currentAttempt.submissionReason = reason
    }

    if (backendDisconnected) {
      clearReconnectCheck()
    }

    await openPostExamUploadHandoff(reason)
  } catch (error) {
    console.error('Submit error:', error)
    markBackendDisconnected(
      'We could not submit your exam right now. Trying to reconnect...'
    )
  } finally {
    isSubmitting = false
    if (!backendDisconnected) {
      updateSubmissionButton(
        examSubmitted,
        examSubmitted ? 'Submitted' : 'Submit Exam'
      )
    }
  }
}

async function startCamera () {
  const video = document.getElementById('video')

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setExamStatus(
      'You need a working camera before the exam can start.',
      'error'
    )
    return false
  }

  try {
    clearPinnedExamStatus()
    resetLiveMonitoringState()

    const devices = await navigator.mediaDevices.enumerateDevices()
    const hasVideoInput = devices.some(device => device.kind === 'videoinput')

    if (!hasVideoInput) {
      setExamStatus(
        'No camera was detected. Connect one to continue with the exam.',
        'error'
      )
      return false
    }

    if (
      currentExamSettings.enableAiProctoring &&
      window.electronAPI?.ensureAIProctoringService
    ) {
      setAIProctoringStatus({
        state: 'starting',
        detail: 'Starting AI proctoring and preparing the live feed...'
      })

      const serviceStatus = await window.electronAPI.ensureAIProctoringService()
      setAIProctoringStatus(serviceStatus)

      if (serviceStatus?.state === 'error') {
        setExamStatus(
          serviceStatus.detail || 'AI proctoring could not be started.',
          'error'
        )
        return false
      }
    } else if (!currentExamSettings.enableAiProctoring) {
      setAIProctoringStatus({
        state: 'idle',
        detail: 'AI proctoring is turned off for this exam.'
      })
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    })

    video.srcObject = stream
    await video.play().catch(() => {})
    setExamStatus('Your camera is connected. You are ready to begin.', 'info')
    frameCaptureController = startFrameCaptureWithOverlay(video)
    return true
  } catch (error) {
    console.error('Camera error:', error)
    setExamStatus(
      'We could not access your camera. Check camera permissions and try again.',
      'error'
    )
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
  'No face detected': {
    type: 'face_absent',
    detail: 'Candidate face not visible in camera.'
  },
  'Multiple faces detected': {
    type: 'multiple_faces',
    detail: 'More than one face detected in frame.'
  },
  'Phone detected': {
    type: 'phone_detected',
    detail: 'A phone was detected in the camera frame.'
  },
  'Looking away from screen': {
    type: 'gaze_away',
    detail: 'Candidate gaze directed away from screen.'
  },
  'Possible speech activity observed': {
    type: 'lip_movement',
    detail: 'Possible speech activity was detected in the camera feed.'
  },
  'Talking detected': {
    type: 'lip_movement',
    detail: 'Lip movement suggesting speech detected.'
  },
  'Camera may be blocked': {
    type: 'camera_blocked',
    detail: 'Lighting anomaly — camera may be covered.'
  },
  // Additional checks
  'Abnormal blink rate detected': {
    type: 'blink_anomaly',
    detail: 'Unusual blink pattern detected.'
  },
  'Abnormal blink pattern observed': {
    type: 'blink_anomaly',
    detail: 'An unusual blink pattern was observed in the live feed.'
  },
  'Lighting too dark — face not visible': {
    type: 'lighting_dark',
    detail: 'Camera feed too dark to verify candidate.'
  },
  'Lighting too dark for reliable monitoring': {
    type: 'lighting_dark',
    detail: 'Lighting is too dark for reliable AI monitoring.'
  },
  'Lighting changed sharply': {
    type: 'proctoring_advisory',
    detail: 'Lighting changed sharply and may affect AI monitoring.'
  },
  'Background movement detected': {
    type: 'background_motion',
    detail: 'Unexpected movement detected in background.'
  },
  'Identity could not be verified': {
    type: 'identity_mismatch',
    detail: 'Candidate face does not match registered identity.'
  }
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
const pendingAiViolations = new Map()
const activeAiAdvisories = new Set()
const pendingAiAdvisories = new Map()
const reportingAiViolations = new Set()
const reportingAiAdvisories = new Set()
const aiSignalRetryAt = new Map()

function getMappedProctoringViolation (message) {
  if (PROCTORING_VIOLATION_MAP[message]) {
    return PROCTORING_VIOLATION_MAP[message]
  }

  for (const [pattern, mapped] of Object.entries(PROCTORING_VIOLATION_MAP)) {
    if (message.startsWith(`${pattern}:`)) {
      return mapped
    }
  }

  if (message.startsWith('Forbidden object detected')) {
    return {
      type: 'proctoring_alert',
      detail: message
    }
  }

  return null
}

function getAiWarningDwellMs (message) {
  for (const [pattern, dwellMs] of Object.entries(
    EXAM_CONFIG.aiWarningDwellMs
  )) {
    if (message === pattern || message.startsWith(`${pattern}:`)) {
      return dwellMs
    }
  }

  return EXAM_CONFIG.aiWarningDefaultDwellMs
}

function getAiAdvisoryDwellMs (message) {
  for (const [pattern, dwellMs] of Object.entries(
    EXAM_CONFIG.aiAdvisoryDwellMs
  )) {
    if (message === pattern || message.startsWith(`${pattern}:`)) {
      return dwellMs
    }
  }

  return EXAM_CONFIG.aiAdvisoryDefaultDwellMs
}

function getAiSignalRetryKey (message, severity = 'warning') {
  return `${severity}:${message}`
}

async function recordAiSignal (message, severity = 'warning') {
  const mapped = getMappedProctoringViolation(message)

  if (mapped) {
    showViolationStatus({
      type: mapped.type,
      detail: mapped.detail,
      severity
    })
    return reportViolation(mapped.type, mapped.detail, severity)
  }

  const fallbackType =
    severity === 'warning' ? 'proctoring_alert' : 'proctoring_advisory'

  showViolationStatus({
    type: fallbackType,
    detail: message,
    severity
  })
  return reportViolation(fallbackType, message, severity)
}

function processIncomingAiViolations (
  incomingViolations,
  incomingAdvisories = new Set()
) {
  const now = Date.now()

  for (const message of incomingViolations) {
    if (!pendingAiViolations.has(message)) {
      pendingAiViolations.set(message, now)
    }

    if (activeViolations.has(message) || reportingAiViolations.has(message)) {
      continue
    }

    const firstSeenAt = pendingAiViolations.get(message) || now
    const dwellMs = getAiWarningDwellMs(message)
    const retryKey = getAiSignalRetryKey(message, 'warning')
    const retryAt = aiSignalRetryAt.get(retryKey) || 0

    if (now - firstSeenAt < dwellMs || now < retryAt) {
      continue
    }

    reportingAiViolations.add(message)
    recordAiSignal(message, 'warning')
      .then(wasRecorded => {
        if (wasRecorded) {
          activeViolations.add(message)
          aiSignalRetryAt.delete(retryKey)
          return
        }

        aiSignalRetryAt.set(
          retryKey,
          Date.now() + EXAM_CONFIG.aiSignalRetryCooldownMs
        )
      })
      .catch(() => {
        aiSignalRetryAt.set(
          retryKey,
          Date.now() + EXAM_CONFIG.aiSignalRetryCooldownMs
        )
      })
      .finally(() => {
        reportingAiViolations.delete(message)
      })
  }

  for (const message of Array.from(pendingAiViolations.keys())) {
    if (!incomingViolations.has(message)) {
      pendingAiViolations.delete(message)
      activeViolations.delete(message)
      reportingAiViolations.delete(message)
      aiSignalRetryAt.delete(getAiSignalRetryKey(message, 'warning'))
    }
  }

  for (const message of incomingAdvisories) {
    if (!pendingAiAdvisories.has(message)) {
      pendingAiAdvisories.set(message, now)
    }

    if (
      activeAiAdvisories.has(message) ||
      reportingAiAdvisories.has(message)
    ) {
      continue
    }

    const firstSeenAt = pendingAiAdvisories.get(message) || now
    const dwellMs = getAiAdvisoryDwellMs(message)
    const retryKey = getAiSignalRetryKey(message, 'info')
    const retryAt = aiSignalRetryAt.get(retryKey) || 0

    if (now - firstSeenAt < dwellMs || now < retryAt) {
      continue
    }

    reportingAiAdvisories.add(message)
    recordAiSignal(message, 'info')
      .then(wasRecorded => {
        if (wasRecorded) {
          activeAiAdvisories.add(message)
          aiSignalRetryAt.delete(retryKey)
          return
        }

        aiSignalRetryAt.set(
          retryKey,
          Date.now() + EXAM_CONFIG.aiSignalRetryCooldownMs
        )
      })
      .catch(() => {
        aiSignalRetryAt.set(
          retryKey,
          Date.now() + EXAM_CONFIG.aiSignalRetryCooldownMs
        )
      })
      .finally(() => {
        reportingAiAdvisories.delete(message)
      })
  }

  for (const message of Array.from(pendingAiAdvisories.keys())) {
    if (!incomingAdvisories.has(message)) {
      pendingAiAdvisories.delete(message)
      activeAiAdvisories.delete(message)
      reportingAiAdvisories.delete(message)
      aiSignalRetryAt.delete(getAiSignalRetryKey(message, 'info'))
    }
  }
}

function startFrameCapture (video) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  const WS_URL = window.PROCTOR_WS_URL || 'ws://localhost:8000/proctor'
  let ws = null
  let intervalId = null
  let hasConnectedOnce = false

  function connect () {
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

    ws.onmessage = event => {
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
        setExamStatus(
          'Your camera is connected. You are ready to begin.',
          'info'
        )
      }
    }

    ws.onerror = err => {
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

  function sendFrame () {
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

function startFrameCaptureWithOverlay (video) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const snapshotCanvas = document.createElement('canvas')
  const snapshotCtx = snapshotCanvas.getContext('2d')
  const snapshotsEnabled =
    currentExamSettings.captureSnapshots ||
    currentExamSettings.enableManualProctoring
  const aiMonitoringEnabled = currentExamSettings.enableAiProctoring

  const WS_URL = window.PROCTOR_WS_URL || 'ws://localhost:8000/proctor'
  let ws = null
  let intervalId = null
  let snapshotIntervalId = null
  let reconnectTimeoutId = null
  let hasConnectedOnce = false
  let stopped = false
  let lastSnapshotUploadAt = 0
  let snapshotUploadInFlight = false
  let teacherBroadcastStarted = false

  if (aiMonitoringEnabled) {
    setAIProctoringStatus({
      state: 'starting',
      detail: 'Connecting the live feed to AI monitoring...'
    })
  } else {
    setAIProctoringStatus({
      state: 'idle',
      detail: snapshotsEnabled
        ? 'AI proctoring is off. Manual monitoring snapshots are still active.'
        : 'AI and snapshot monitoring are turned off for this exam.'
    })
  }

  function ensureTeacherBroadcastStarted () {
    if (teacherBroadcastStarted) {
      return
    }

    teacherBroadcastStarted = true

    if (teacherBroadcastStartTimeoutId) {
      clearTimeout(teacherBroadcastStartTimeoutId)
    }

    teacherBroadcastStartTimeoutId = setTimeout(() => {
      startTeacherWebRTCBroadcast().catch(error => {
        console.warn('[Live Monitoring] WebRTC broadcast failed to initialize:', error)
      })
    }, 1200)
  }

  function connect () {
    if (stopped) {
      return
    }

    ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      console.log('[Proctor] WebSocket connected')
      resetLiveMonitoringState()
      setAIProctoringStatus({
        state: 'running',
        detail: 'Live monitoring is connected and checking the camera feed.'
      })
      ensureTeacherBroadcastStarted()

      if (hasConnectedOnce) {
        reportViolation(
          'proctor_reconnected',
          'The proctoring connection is active again.',
          'info'
        )
      }

      hasConnectedOnce = true
      intervalId = setInterval(sendFrame, EXAM_CONFIG.proctorFrameIntervalMs)
    }

    ws.onmessage = event => {
      if (!examStarted || examSubmitted) {
        return
      }

      let result
      try {
        result = JSON.parse(event.data)
      } catch {
        return
      }

      lastProctorPayloadAt = Date.now()

      if (result.error) {
        setAIProctoringStatus({
          state: 'error',
          detail: result.message || 'AI monitoring returned an error.'
        })
        return
      }

      const incomingViolations = new Set(result.violations || [])
      const incomingAdvisories = new Set(result.advisories || [])
      setLiveAIWarnings(
        Array.from(incomingViolations),
        Array.from(incomingAdvisories)
      )

      processIncomingAiViolations(incomingViolations, incomingAdvisories)

      if (incomingViolations.size > 0) {
        const primaryWarning = Array.from(incomingViolations)[0]
        setAIProctoringStatus({
          state: 'warning',
          detail: primaryWarning || 'AI monitoring found an active warning.'
        })
        setExamStatus(
          'AI proctoring detected an active warning. Check the warning panel and return to a safe state immediately.',
          'warning'
        )
      } else if (incomingAdvisories.size > 0) {
        setAIProctoringStatus({
          state: 'running',
          detail: 'Live monitoring is active and showing advisory signals.'
        })
        setExamStatus(
          'AI monitoring has a few live advisories. Review the top banner and keep the candidate properly framed.',
          'info'
        )
      } else if (incomingViolations.size === 0) {
        setAIProctoringStatus({
          state: 'running',
          detail: 'Live monitoring is active and the feed is clear.'
        })
        setExamStatus(
          'Your camera is connected. You are ready to begin.',
          'info'
        )
      }
    }

    ws.onerror = err => {
      console.warn('[Proctor] WebSocket error:', err)
    }

    ws.onclose = () => {
      console.warn('[Proctor] WebSocket closed - reconnecting in 3s')
      clearInterval(intervalId)
      intervalId = null
      resetLiveMonitoringState()

      if (!stopped) {
        setAIProctoringStatus({
          state: 'starting',
          detail: 'Live monitoring connection was lost. Reconnecting...'
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

  function captureSnapshotFrame () {
    if (!snapshotCtx || !video.videoWidth || !video.videoHeight) {
      return null
    }

    const targetWidth = Math.min(480, video.videoWidth)
    const targetHeight = Math.max(
      1,
      Math.round((video.videoHeight / video.videoWidth) * targetWidth)
    )

    snapshotCanvas.width = targetWidth
    snapshotCanvas.height = targetHeight
    snapshotCtx.drawImage(video, 0, 0, targetWidth, targetHeight)

    return snapshotCanvas.toDataURL('image/jpeg', 0.4).split(',')[1]
  }

  function maybeUploadSnapshot () {
    if (!snapshotsEnabled) return
    if (!video.videoWidth) return
    const now = Date.now()
    if (
      now - lastSnapshotUploadAt >= EXAM_CONFIG.liveSnapshotUploadIntervalMs &&
      !snapshotUploadInFlight
    ) {
      const snapshotFrame = captureSnapshotFrame()

      if (snapshotFrame) {
        lastSnapshotUploadAt = now
        snapshotUploadInFlight = true
        uploadLiveSnapshot(snapshotFrame)
          .catch(error => {
            console.warn('[Live Monitoring] Snapshot upload failed:', error)
          })
          .finally(() => {
            snapshotUploadInFlight = false
          })
      }
    }
  }

  function ensureSnapshotLoop () {
    if (!snapshotsEnabled) {
      return
    }

    if (snapshotIntervalId) {
      return
    }

    snapshotIntervalId = setInterval(maybeUploadSnapshot, EXAM_CONFIG.liveSnapshotUploadIntervalMs)
  }

  function sendFrame () {
    maybeUploadSnapshot()
    if (!video.videoWidth) return

    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (ws.bufferedAmount > 0) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const frame = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
    ws.send(JSON.stringify({ frame }))
  }

  ensureSnapshotLoop()
  if (aiMonitoringEnabled) {
    connect()
  } else {
    ensureTeacherBroadcastStarted()
  }

  return {
    stop () {
      stopped = true
      clearInterval(intervalId)
      clearInterval(snapshotIntervalId)
      clearTimeout(reconnectTimeoutId)
      clearTimeout(teacherBroadcastStartTimeoutId)
      intervalId = null
      snapshotIntervalId = null
      reconnectTimeoutId = null
      teacherBroadcastStartTimeoutId = null
      resetLiveMonitoringState()

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

function shouldLogBlockedProcess (processName) {
  const key = String(processName || '').toLowerCase()
  const previousLoggedAt = recentBlockedAppWarnings.get(key) || 0
  const now = Date.now()

  if (now - previousLoggedAt < EXAM_CONFIG.networkAppWarningCooldownMs) {
    return false
  }

  recentBlockedAppWarnings.set(key, now)
  return true
}

function getBlockedShortcutMessage (event) {
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

async function goBackToDashboard () {
  if (examSubmitted) {
    window.location = 'dashboard.html'
    return
  }

  const shouldLeave = window.confirm(
    'Leaving the exam will submit it immediately. Do you want to continue?'
  )

  if (!shouldLeave) {
    return
  }

  await reportViolation(
    'left_exam_view',
    'Candidate left the exam view before completion.',
    'warning'
  )
  await submitExam('left_exam')
}

function registerExamGuards () {
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
    reportViolation(
      'blocked_shortcut',
      `Candidate attempted a blocked shortcut: ${shortcutMessage}`,
      'warning'
    )
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
      detail:
        blurSeverity === 'info'
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
        detail:
          visibilitySeverity === 'info'
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
      reportViolation(
        'fullscreen_exit',
        'Candidate exited fullscreen mode during the exam.',
        'warning'
      )
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
      reportViolation(
        'blocked_network_app',
        `Detected and closed blocked application(s): ${blockedList}.`,
        'warning'
      )
    })
  }

  if (window.electronAPI?.onAIProctoringStatus) {
    window.electronAPI.onAIProctoringStatus(status => {
      setAIProctoringStatus(status)
    })
  }

  if (window.electronAPI?.onWebRTCBroadcastState) {
    window.electronAPI.onWebRTCBroadcastState(status => {
      webRTCBroadcastState = status || webRTCBroadcastState
    })
  }
}

window.addEventListener('beforeunload', () => {
  if (!examSubmitted) {
    reportViolation(
      'page_unload',
      'Exam page attempted to unload before submission.',
      'warning'
    )
  }

  releaseExamResources()
})

window.addEventListener('load', async () => {
  // Check for valid session (either auth-based or room-based)
  const hasAuthSession = getStoredSession()
  const hasRoomEnrollment = await getRoomEnrollment()

  if (!hasAuthSession && !hasRoomEnrollment) {
    // No valid session - redirect to join page
    window.location = 'join.html'
    return
  }

  // Initialize room enrollment data if present
  if (hasRoomEnrollment) {
    roomEnrollment = hasRoomEnrollment
  }

  startLiveUiRefreshLoop()
  initializeProctorDock()

  if (window.electronAPI?.getAIProctoringStatus) {
    const initialAIStatus = await window.electronAPI.getAIProctoringStatus()
    setAIProctoringStatus(initialAIStatus)
  } else {
    renderVideoFeedState()
    renderTopWarningBanner()
  }

  registerDevMonitoringControls()
  await loadDevMonitoringSettings()
  registerExamGuards()
  registerAudioUnlockHandlers()
  await unlockAlertAudio()

  await loadExam()
})
