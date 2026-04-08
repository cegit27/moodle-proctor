function setStatus(message, type = 'info') {
  const status = document.getElementById('dashboardMessage')

  if (!status) {
    return
  }

  status.hidden = !message
  status.className = `status-message ${type}`
  status.innerText = message || ''
}

function formatLabel(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getWarningLimit(attempt) {
  const maxWarnings = Number(attempt?.maxWarnings)

  if (Number.isFinite(maxWarnings) && maxWarnings > 0) {
    return maxWarnings
  }

  return 15
}

function updateViolationPolicyCopy(maxWarnings = 15) {
  const violationModalCopy = document.getElementById('violationModalCopy')
  const warningLimitRule = document.getElementById('warningLimitRule')
  const warningLimitAgreement = document.getElementById('warningLimitAgreement')

  if (violationModalCopy) {
    violationModalCopy.innerText =
      `Read these rules carefully. Warnings are recorded during the exam, and the exam will end automatically after ${maxWarnings} warnings.`
  }

  if (warningLimitRule) {
    warningLimitRule.innerText =
      `At ${maxWarnings} warnings, the exam is submitted automatically and cannot be resumed.`
  }

  if (warningLimitAgreement) {
    warningLimitAgreement.innerText =
      `I have read and understood the exam rules, warning policy, and the ${maxWarnings}-warning limit.`
  }
}

function renderAttemptSummary(attempt) {
  const attemptStatusElement = document.getElementById('attemptStatus')
  const attemptWarningsElement = document.getElementById('attemptWarnings')
  const attemptSubmissionReasonElement = document.getElementById('attemptSubmissionReason')

  if (!attemptStatusElement || !attemptWarningsElement || !attemptSubmissionReasonElement) {
    return
  }

  const status = attempt?.status || 'not_started'
  const warningCount = Number(attempt?.violationCount || 0)
  const maxWarnings = getWarningLimit(attempt)
  const submissionReason = attempt?.submissionReason

  attemptStatusElement.innerText = formatLabel(status) || 'Not Started'
  attemptWarningsElement.innerText = `${warningCount} / ${maxWarnings}`
  attemptSubmissionReasonElement.innerText = submissionReason
    ? formatLabel(submissionReason)
    : 'Not submitted yet'
}

function updateStartButton(attempt) {
  const startButton = document.querySelector('.start-btn')

  if (!startButton) {
    return
  }

  const canResume = Boolean(attempt?.canResume || attempt?.status === 'in_progress')
  startButton.innerText = canResume ? 'Resume Exam' : 'Start Exam'
}

async function loadDashboard() {
  setStatus('Loading your exam details...', 'info')

  try {
    const response = await fetchWithSession(`${API_BASE_URL}/api/student`)

    if (!response) {
      return
    }

    const data = await response.json()

    if (!response.ok || !data.student) {
      setStatus('We could not load your exam details.', 'error')
      return
    }

    document.getElementById('studentName').innerText = data.student.name
    document.getElementById('studentEmail').innerText = data.student.email
    document.getElementById('examName').innerText = data.student.exam
    updateViolationPolicyCopy(getWarningLimit(data.attempt))
    renderAttemptSummary(data.attempt)
    updateStartButton(data.attempt)

    if (data.attempt?.status === 'submitted') {
      setStatus('This exam has already been submitted.', 'info')
      return
    }

    if (data.attempt?.status === 'in_progress') {
      setStatus('Your exam is already in progress. You can continue when you are ready.', 'info')
      return
    }

    setStatus('You are ready to start the exam.', 'info')
  } catch (error) {
    setStatus('We could not reach the server. Please make sure the backend is running.', 'error')
  }
}

function startExam() {
  const violationModal = document.getElementById('violationModal')
  const agreementCheckbox = document.getElementById('violationAgreement')
  const confirmStartButton = document.getElementById('confirmStartButton')

  if (!violationModal || !agreementCheckbox || !confirmStartButton) {
    setStatus('Opening your exam...', 'info')
    window.location = 'exam.html'
    return
  }

  agreementCheckbox.checked = false
  confirmStartButton.disabled = true
  violationModal.hidden = false
  setStatus('Please review the exam rules before you start.', 'info')
}

function closeViolationModal() {
  const violationModal = document.getElementById('violationModal')

  if (!violationModal) {
    return
  }

  violationModal.hidden = true
  setStatus('Exam start cancelled. Review the rules when you are ready.', 'info')
}

function confirmStartExam() {
  setStatus('Opening your exam...', 'info')
  window.location = 'exam.html'
}

async function logout() {
  const logoutButton = document.getElementById('logoutButton')

  if (logoutButton) {
    logoutButton.disabled = true
  }

  try {
    const response = await fetchWithSession(`${API_BASE_URL}/api/logout`, {
      method: 'POST'
    })

    if (response) {
      await response.json().catch(() => null)
    }
  } finally {
    clearSession()
    redirectToLogin('You have been logged out.')
  }
}

window.addEventListener('load', () => {
  updateViolationPolicyCopy()
  loadDashboard()

  const agreementCheckbox = document.getElementById('violationAgreement')
  const confirmStartButton = document.getElementById('confirmStartButton')

  if (agreementCheckbox && confirmStartButton) {
    agreementCheckbox.addEventListener('change', () => {
      confirmStartButton.disabled = !agreementCheckbox.checked
    })
  }
})
