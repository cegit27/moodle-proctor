function setMessage(message, type = 'info') {
  const messageElement = document.getElementById('joinMessage');

  if (!messageElement) {
    return;
  }

  messageElement.hidden = !message;
  messageElement.className = `status-message ${type}`;
  messageElement.innerText = message || '';
}

function setLoadingState(isLoading) {
  const joinButton = document.getElementById('joinButton');

  if (!joinButton) {
    return;
  }

  joinButton.disabled = isLoading;
  joinButton.innerText = isLoading ? 'Joining...' : 'Join Room';
}

let hasAttemptedAutoJoin = false;

function normalizeRoomCode(code) {
  // Remove spaces, convert to uppercase
  return code.replace(/\s/g, '').toUpperCase();
}

function validateInputs(name, email, roomCode) {
  if (!name || name.trim().length < 2) {
    setMessage('Please enter your full name.', 'error');
    return false;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    setMessage('Please enter a valid email address.', 'error');
    return false;
  }

  // Room code validation (8 alphanumeric characters)
  const normalizedCode = normalizeRoomCode(roomCode);
  if (!normalizedCode || normalizedCode.length !== 8 || !/^[A-Z0-9]+$/.test(normalizedCode)) {
    setMessage('Please enter a valid 8-character invite code.', 'error');
    return false;
  }

  return true;
}

async function getSafeStorage() {
  const safeStorage = window.electronAPI?.safeStorage;

  if (!safeStorage) {
    return null;
  }

  try {
    const isEncryptionAvailable = await safeStorage.isEncryptionAvailable();
    return isEncryptionAvailable ? safeStorage : null;
  } catch (error) {
    console.error('Failed to access safeStorage availability:', error);
    return null;
  }
}

/**
 * Encrypt and store enrollment data using Electron's safeStorage
 * Falls back to regular localStorage if safeStorage is unavailable
 */
async function storeRoomEnrollment(enrollmentData) {
  const encryptedKey = 'roomEnrollmentEncrypted';
  const dataString = JSON.stringify(enrollmentData);

  try {
    const safeStorage = await getSafeStorage();

    if (safeStorage) {
      // Encrypt the data
      const encryptedData = await safeStorage.encryptString(dataString);
      localStorage.setItem(encryptedKey, encryptedData);
      localStorage.removeItem('roomEnrollment'); // Remove unencrypted version
    } else {
      // Fallback: store unencrypted (development/non-Electron environment)
      console.warn('safeStorage not available, storing unencrypted data');
      localStorage.removeItem(encryptedKey);
      localStorage.setItem('roomEnrollment', dataString);
    }
  } catch (error) {
    console.error('Encryption failed, falling back to unencrypted storage:', error);
    // Fallback to unencrypted storage on error
    localStorage.removeItem(encryptedKey);
    localStorage.setItem('roomEnrollment', dataString);
  }
}

async function joinRoom() {
  const nameInput = document.getElementById('studentName');
  const emailInput = document.getElementById('studentEmail');
  const codeInput = document.getElementById('roomCode');

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const rawCode = codeInput.value;
  const roomCode = normalizeRoomCode(rawCode);

  // Validate inputs
  if (!validateInputs(name, email, rawCode)) {
    return;
  }

  setLoadingState(true);
  setMessage('Joining room...', 'info');

  try {
    const response = await fetch(`${API_BASE_URL}/api/room/${roomCode}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...MANUAL_PROCTORING_HEADERS
      },
      body: JSON.stringify({
        studentName: name,
        studentEmail: email
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      // Handle specific error cases
      if (response.status === 404) {
        setMessage('Invalid invite code. Please check and try again.', 'error');
      } else if (response.status === 409) {
        setMessage(data.error || 'You are already enrolled in this room.', 'error');
      } else if (response.status === 429) {
        setMessage(data.error || 'This room is full. Please contact your instructor.', 'error');
      } else {
        setMessage(data.error || 'Failed to join room. Please try again.', 'error');
      }
      return;
    }

    // Success! Store enrollment data and redirect to exam
    await storeRoomEnrollment({
      enrollmentId: data.data.enrollmentId,
      roomId: data.data.roomId,
      roomCode: data.data.roomCode,
      examName: data.data.examName,
      courseName: data.data.courseName,
      studentName: name,
      studentEmail: email,
      enrollmentSignature: data.data.enrollmentSignature, // Store signature for validation
      joinedAt: new Date().toISOString()
    });

    setMessage('Successfully joined! Redirecting to exam...', 'info');

    // Redirect to exam page after a short delay
    setTimeout(() => {
      window.location = 'exam.html';
    }, 1000);

  } catch (error) {
    console.error('Join room error:', error);
    setMessage('Unable to reach the server. Check that the backend is running.', 'error');
  } finally {
    setLoadingState(false);
  }
}

function prefillJoinDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const codeFromUrl = urlParams.get('code');
  const nameFromUrl = urlParams.get('name');
  const emailFromUrl = urlParams.get('email');

  if (codeFromUrl) {
    const codeInput = document.getElementById('roomCode');
    if (codeInput) {
      codeInput.value = normalizeRoomCode(codeFromUrl);
    }
  }

  if (nameFromUrl) {
    const nameInput = document.getElementById('studentName');
    if (nameInput) {
      nameInput.value = nameFromUrl.trim();
    }
  }

  if (emailFromUrl) {
    const emailInput = document.getElementById('studentEmail');
    if (emailInput) {
      emailInput.value = emailFromUrl.trim().toLowerCase();
    }
  }
}

function shouldAutoJoinFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const autoJoinValue = (urlParams.get('autoJoin') || '').trim().toLowerCase();
  return ['1', 'true', 'yes'].includes(autoJoinValue);
}

function attemptAutoJoin() {
  if (hasAttemptedAutoJoin || !shouldAutoJoinFromUrl()) {
    return;
  }

  const name = document.getElementById('studentName')?.value?.trim();
  const email = document.getElementById('studentEmail')?.value?.trim();
  const roomCode = document.getElementById('roomCode')?.value?.trim();

  if (!name || !email || !roomCode) {
    return;
  }

  hasAttemptedAutoJoin = true;
  joinRoom();
}

// Initialize on page load
window.addEventListener('load', () => {
  prefillJoinDetails();

  // Allow pressing Enter in any field to submit
  const inputs = ['studentName', 'studentEmail', 'roomCode'];
  inputs.forEach(inputId => {
    const input = document.getElementById(inputId);
    if (input) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          joinRoom();
        }
      });
    }
  });

  attemptAutoJoin();
});
