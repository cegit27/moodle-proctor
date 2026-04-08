let uploadSession = null
let countdownTimerId = null
let refreshTimerId = null

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
    return 'Answer sheet PDF received. This upload is now stored and visible in the teacher dashboard.'
  }

  if (status === 'expired') {
    return 'The upload window ended before a PDF was submitted. Create a new upload session if the teacher wants to accept a late file.'
  }

  if (status === 'upload_in_progress') {
    return 'The student has started the upload. Keep this screen open until the status changes to uploaded.'
  }

  return 'Waiting for the student to scan the QR code and submit the answer sheet PDF from their phone.'
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
  uploadSession = session
  storeLocalUploadSession(session)
  setStatusBadge(session.status)

  const qrImage = document.getElementById('uploadSessionQrImage')
  const qrFallback = document.getElementById('uploadSessionQrFallback')
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
  const qrImageSource = buildQrImageSource(session)

  if (qrImage && qrImageSource) {
    qrImage.onerror = () => {
      qrImage.hidden = true
      qrImage.removeAttribute('src')
      if (qrFallback) {
        qrFallback.textContent = 'QR code unavailable. Use the link below.'
        qrFallback.hidden = false
      }
    }
    qrImage.onload = () => {
      if (qrFallback) {
        qrFallback.hidden = true
      }
    }
    qrImage.src = qrImageSource
    qrImage.hidden = false
    if (qrFallback) {
      qrFallback.textContent = session.qrCodeDataUrl
        ? 'Generating QR code...'
        : 'Loading QR code...'
      qrFallback.hidden = false
    }
  } else {
    if (qrImage) {
      qrImage.hidden = true
      qrImage.removeAttribute('src')
    }

    if (qrFallback) {
      qrFallback.textContent = uploadSession?.token
        ? 'Generating QR code...'
        : 'QR code unavailable'
      qrFallback.hidden = false
    }
  }

  if (mobileLink) {
    mobileLink.href = session.mobileEntryUrl || '#'
    mobileLink.textContent = session.mobileEntryUrl || 'Mobile upload link unavailable'
  }

  if (student) {
    student.innerHTML = `${escapeHtml(session.student?.name || 'Student')}<br><span>${escapeHtml(session.student?.email || '')}</span>`
  }

  if (exam) {
    const examName = escapeHtml(session.exam?.name || 'Exam')
    const courseName = escapeHtml(session.exam?.courseName || '')
    exam.innerHTML = courseName ? `${examName}<br><span>${courseName}</span>` : examName
  }

  if (attempt) {
    const attemptId = session.attempt?.id ? `#${escapeHtml(session.attempt.id)}` : 'Not available'
    const submittedAt = formatDateTime(session.attempt?.submittedAt)
    attempt.innerHTML = `${attemptId}<br><span>${escapeHtml(submittedAt)}</span>`
  }

  if (token) {
    token.textContent = session.token || 'Unavailable'
  }

  if (windowNode) {
    windowNode.textContent = `${session.uploadWindowMinutes || 0} minutes`
  }

  if (acceptedFiles) {
    acceptedFiles.textContent = (session.acceptedFileTypes || ['application/pdf']).join(', ')
  }

  if (countdown) {
    countdown.textContent =
      session.status === 'uploaded' ? 'Completed' : formatCountdown(session.expiresAt)
  }

  if (uploadedAt) {
    uploadedAt.textContent = formatDateTime(session.upload?.uploadedAt)
  }

  if (receipt) {
    receipt.textContent = session.upload?.receiptId || 'Pending'
  }

  if (fileName) {
    if (session.upload?.fileName) {
      const size = session.upload?.fileSizeBytes
      fileName.textContent = size
        ? `${session.upload.fileName} (${Math.round(size / 1024)} KB)`
        : session.upload.fileName
    } else {
      fileName.textContent = 'Pending PDF upload'
    }
  }

  if (stateMessage) {
    stateMessage.textContent = formatUploadSummary(session)
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
    fallback.textContent = 'No active upload session'
    fallback.hidden = false
  }

  if (card) {
    card.textContent = 'The upload session was not available. Return to the dashboard and submit the exam again if you need to recreate it.'
  }
}

async function refreshUploadSession () {
  if (!uploadSession?.token) {
    return
  }

  if (!window.electronAPI?.refreshScanSession) {
    renderUploadSession(uploadSession)
    return
  }

  try {
    const latestSession = await window.electronAPI.refreshScanSession(uploadSession.token)

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
      }, 10000)
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
