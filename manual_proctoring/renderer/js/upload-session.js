let uploadSession = null
let countdownTimerId = null
let refreshTimerId = null
const REFRESH_INTERVAL_MS = 3000

function getLocalUploadSession () {
  try {
    const rawValue = localStorage.getItem('postExamUploadSession')

    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    console.error('Failed to read local upload session fallback:', error)
    return null
  }
}

function storeLocalUploadSession (session) {
  if (!session || typeof session !== 'object') {
    return
  }

  try {
    localStorage.setItem('postExamUploadSession', JSON.stringify(session))
  } catch (error) {
    console.error('Failed to persist local upload session fallback:', error)
  }
}

function normalizeBackendApiBaseUrl (value) {
  const rawValue = String(value || '').trim()
  if (!rawValue) {
    return ''
  }

  return rawValue.endsWith('/') ? rawValue.slice(0, -1) : rawValue
}

function escapeHtml (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDateTime (value) {
  if (!value) {
    return 'Not available'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return date.toLocaleString()
}

function formatCountdown (expiresAt) {
  const remainingMs = Math.max(0, Number(expiresAt || 0) - Date.now())
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (totalSeconds <= 0) {
    return 'Expired'
  }

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

function formatUploadSummary (session) {
  const status = String(session?.status || 'awaiting_upload')

  if (status === 'uploaded') {
    return 'Your answer-sheet PDF has been received successfully.'
  }

  if (status === 'expired') {
    return 'The upload window has ended. Please contact the invigilator or teacher if you still need to submit.'
  }

  if (status === 'upload_in_progress') {
    return 'Your file is being uploaded. Please keep this page open until the upload is complete.'
  }

  return 'Scan the QR code and upload your answer-sheet PDF before the upload window ends.'
}

function buildQrImageSource (session) {
  if (session?.qrCodeDataUrl) {
    return session.qrCodeDataUrl
  }

  if (!session?.mobileEntryUrl) {
    return ''
  }

  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(session.mobileEntryUrl)}`
}

function updateQrPresentation (session) {
  const qrImage = document.getElementById('uploadSessionQrImage')
  const qrFallback = document.getElementById('uploadSessionQrFallback')
  const qrImageSource = buildQrImageSource(session)
  const previousSource = qrImage?.dataset.qrSource || ''

  if (!qrImage) {
    return
  }

  if (qrImageSource) {
    qrImage.onerror = () => {
      qrImage.hidden = true
      qrImage.removeAttribute('src')
      qrImage.dataset.qrSource = ''
      if (qrFallback) {
        qrFallback.textContent = 'QR code unavailable. Use the link below instead.'
        qrFallback.hidden = false
      }
    }

    qrImage.onload = () => {
      if (qrFallback) {
        qrFallback.hidden = true
      }
    }

    if (previousSource !== qrImageSource) {
      if (qrFallback) {
        qrFallback.textContent = session.qrCodeDataUrl
          ? 'Generating QR code...'
          : 'Loading QR code...'
        qrFallback.hidden = false
      }

      qrImage.dataset.qrSource = qrImageSource
      qrImage.src = qrImageSource
    }

    qrImage.hidden = false
    return
  }

  qrImage.hidden = true
  qrImage.removeAttribute('src')
  qrImage.dataset.qrSource = ''

  if (qrFallback) {
    qrFallback.textContent = uploadSession?.token
      ? 'Generating QR code...'
      : 'QR code unavailable'
    qrFallback.hidden = false
  }
}

function setStatusBadge (status) {
  const badge = document.getElementById('uploadSessionStatusBadge')

  if (!badge) {
    return
  }

  const normalizedStatus = String(status || 'awaiting_upload')
  const labelMap = {
    awaiting_upload: 'Awaiting upload',
    upload_in_progress: 'Upload in progress',
    uploaded: 'Uploaded',
    expired: 'Expired'
  }

  badge.textContent = labelMap[normalizedStatus] || 'Awaiting upload'
  badge.className = `upload-session-badge upload-session-badge-${normalizedStatus}`
}

function renderUploadSession (session) {
  uploadSession = {
    ...(uploadSession || {}),
    ...(session || {})
  }
  storeLocalUploadSession(uploadSession)
  setStatusBadge(uploadSession.status)

  const mobileLink = document.getElementById('uploadSessionMobileLink')
  const student = document.getElementById('uploadSessionStudent')
  const exam = document.getElementById('uploadSessionExam')
  const attempt = document.getElementById('uploadSessionAttempt')
  const token = document.getElementById('uploadSessionToken')
  const windowNode = document.getElementById('uploadSessionWindow')
  const countdown = document.getElementById('uploadSessionCountdown')
  const acceptedFiles = document.getElementById('uploadSessionAcceptedFiles')
  const uploadedAt = document.getElementById('uploadSessionUploadedAt')
  const receipt = document.getElementById('uploadSessionReceipt')
  const fileName = document.getElementById('uploadSessionFileName')
  const stateMessage = document.getElementById('uploadSessionStateMessage')

  updateQrPresentation(uploadSession)

  if (mobileLink) {
    mobileLink.href = uploadSession.mobileEntryUrl || '#'
    mobileLink.textContent = uploadSession.mobileEntryUrl || 'Mobile upload link unavailable'
  }

  if (student) {
    student.innerHTML = `${escapeHtml(uploadSession.student?.name || 'Student')}<br><span>${escapeHtml(uploadSession.student?.email || '')}</span>`
  }

  if (exam) {
    const examName = escapeHtml(uploadSession.exam?.name || 'Exam')
    const courseName = escapeHtml(uploadSession.exam?.courseName || '')
    exam.innerHTML = courseName ? `${examName}<br><span>${courseName}</span>` : examName
  }

  if (attempt) {
    const attemptId = uploadSession.attempt?.id ? `#${escapeHtml(uploadSession.attempt.id)}` : 'Not available'
    const submittedAt = formatDateTime(uploadSession.attempt?.submittedAt)
    attempt.innerHTML = `${attemptId}<br><span>${escapeHtml(submittedAt)}</span>`
  }

  if (token) {
    token.textContent = uploadSession.token || 'Unavailable'
  }

  if (windowNode) {
    windowNode.textContent = `${uploadSession.uploadWindowMinutes || 0} minutes`
  }

  if (acceptedFiles) {
    acceptedFiles.textContent = (uploadSession.acceptedFileTypes || ['application/pdf']).join(', ')
  }

  if (countdown) {
    countdown.textContent =
      uploadSession.status === 'uploaded' ? 'Completed' : formatCountdown(uploadSession.expiresAt)
  }

  if (uploadedAt) {
    uploadedAt.textContent = formatDateTime(uploadSession.upload?.uploadedAt)
  }

  if (receipt) {
    receipt.textContent = uploadSession.upload?.receiptId || 'Pending'
  }

  if (fileName) {
    if (uploadSession.upload?.fileName) {
      const size = uploadSession.upload?.fileSizeBytes
      fileName.textContent = size
        ? `${uploadSession.upload.fileName} (${Math.round(size / 1024)} KB)`
        : uploadSession.upload.fileName
    } else {
      fileName.textContent = 'Pending PDF upload'
    }
  }

  if (stateMessage) {
    stateMessage.textContent = formatUploadSummary(uploadSession)
  }

  if (countdownTimerId) {
    clearInterval(countdownTimerId)
  }

  countdownTimerId = window.setInterval(() => {
    if (!uploadSession) {
      return
    }

    const countdownNode = document.getElementById('uploadSessionCountdown')
    if (countdownNode) {
      countdownNode.textContent =
        uploadSession.status === 'uploaded'
          ? 'Completed'
          : formatCountdown(uploadSession.expiresAt)
    }

    if (Date.now() >= Number(uploadSession.expiresAt || 0)) {
      uploadSession.status = 'expired'
      setStatusBadge('expired')
      clearInterval(countdownTimerId)
      countdownTimerId = null
    }
  }, 1000)
}

function renderMissingSession () {
  setStatusBadge('expired')

  const fallback = document.getElementById('uploadSessionQrFallback')
  const card = document.getElementById('uploadSessionStateMessage')

  if (fallback) {
    fallback.textContent = 'No upload session found'
    fallback.hidden = false
  }

  if (card) {
    card.textContent = 'This upload session is not available. Return to the exam home page and submit again if you need a new upload session.'
  }
}

async function refreshUploadSession () {
  if (!uploadSession?.token) {
    return
  }

  try {
    let latestSession = null

    if (window.electronAPI?.refreshScanSession) {
      latestSession = await window.electronAPI.refreshScanSession(uploadSession.token)
    }

    if (!latestSession) {
      const backendApiBaseUrl = normalizeBackendApiBaseUrl(uploadSession.backendApiBaseUrl)

      if (backendApiBaseUrl) {
        const response = await fetch(
          `${backendApiBaseUrl}/api/scan/sessions/${encodeURIComponent(uploadSession.token)}`,
          {
            method: 'GET',
            cache: 'no-store'
          }
        )

        const payload = await response.json().catch(() => ({}))

        if (response.ok && payload?.data) {
          latestSession = {
            ...(uploadSession || {}),
            ...(payload.data || {}),
            backendApiBaseUrl
          }
        } else if (payload?.data) {
          latestSession = {
            ...(uploadSession || {}),
            ...(payload.data || {}),
            backendApiBaseUrl
          }
        }
      }
    }

    if (!latestSession) {
      renderMissingSession()
      return
    }

    renderUploadSession(latestSession)

    if (latestSession.status === 'uploaded' || latestSession.status === 'expired') {
      if (refreshTimerId) {
        clearInterval(refreshTimerId)
        refreshTimerId = null
      }
    }
  } catch (error) {
    console.error('Failed to refresh upload session:', error)
  }
}

async function initializeUploadSessionPage () {
  const backButton = document.getElementById('uploadSessionBackButton')
  const refreshButton = document.getElementById('uploadSessionRefreshButton')
  if (backButton) {
    backButton.addEventListener('click', () => {
      window.location = 'dashboard.html'
    })
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      refreshUploadSession()
    })
  }

  try {
    const session =
      (await window.electronAPI?.getScanSession?.()) || getLocalUploadSession()

    if (!session) {
      renderMissingSession()
      return
    }

    renderUploadSession(session)

    if (!session.qrCodeDataUrl && session.token && window.electronAPI?.refreshScanSession) {
      await refreshUploadSession()
    }

    if (!refreshTimerId) {
      refreshTimerId = window.setInterval(() => {
        refreshUploadSession()
      }, REFRESH_INTERVAL_MS)
    }
  } catch (error) {
    console.error('Failed to load upload session:', error)
    renderMissingSession()
  }
}

window.addEventListener('beforeunload', () => {
  if (countdownTimerId) {
    clearInterval(countdownTimerId)
  }

  if (refreshTimerId) {
    clearInterval(refreshTimerId)
  }
})

document.addEventListener('DOMContentLoaded', initializeUploadSessionPage)
