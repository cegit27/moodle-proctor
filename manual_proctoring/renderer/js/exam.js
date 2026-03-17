// LOAD EXAM DATA
async function loadExam() {

    try {

        const response = await fetch("http://localhost:5000/exam");
        const data = await response.json();

        // start timer
        startTimer(data.timer);

        // VIEW ONLY PDF (remove download + print toolbar)
        const fileUrl = "http://localhost:5000/files/" + data.questionPaper + "#toolbar=0";

        document.getElementById("questionFrame").src = fileUrl;

    } catch (error) {

        console.error("Error loading exam:", error);
        alert("Failed to load exam.");

    }

}


// TIMER FUNCTION
function startTimer(seconds) {

    let time = seconds;

    const timerElement = document.getElementById("timer");

    const interval = setInterval(() => {

        let minutes = Math.floor(time / 60);
        let sec = time % 60;

        if (minutes < 10) {
            minutes = "0" + minutes;
        }

        if (sec < 10) {
            sec = "0" + sec;
        }

        timerElement.innerText = minutes + ":" + sec;

        time--;
if (time < 0) {

    clearInterval(interval);

    // Exit kiosk mode when exam ends
    window.electronAPI.endTest();

    document.body.innerHTML = `
        <div style="
            display:flex;
            justify-content:center;
            align-items:center;
            height:100vh;
            font-family:Arial;
            background:#f4f6f9;
        ">
            <div style="
                background:white;
                padding:40px;
                border-radius:10px;
                box-shadow:0 4px 10px rgba(0,0,0,0.1);
                text-align:center;
            ">
                <h1> Exam Completed</h1>
                <p>Your exam has been submitted successfully.</p>
            </div>
        </div>
    `;

}
    }, 1000);

}

async function startCamera() {

    try {

        const video = document.getElementById("video");

        // Permission already granted on dashboard
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        video.srcObject = stream;

        video.onloadedmetadata = () => {
            video.play();
        };

    }

    catch (error) {

        console.error("Camera error:", error);
        console.log("If permission was already granted, this should not occur.");

    }

}

// Disable right click
document.addEventListener("contextmenu", e => e.preventDefault());

// Disable copy
document.addEventListener("copy", e => e.preventDefault());

// Disable cut
document.addEventListener("cut", e => e.preventDefault());

// Disable paste
document.addEventListener("paste", e => e.preventDefault());

// Disable keyboard shortcuts for copy/cut/paste and print
document.addEventListener("keydown", function(e) {

    // Ctrl+C (Copy)
    if (e.ctrlKey && e.key === "c") {
        e.preventDefault();
    }
    
    // Ctrl+X (Cut)
    if (e.ctrlKey && e.key === "x") {
        e.preventDefault();
    }
    
    // Ctrl+V (Paste)
    if (e.ctrlKey && e.key === "v") {
        e.preventDefault();
    }
    
    // Ctrl+P (Print)
    if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        alert("Printing is disabled during exam");
    }

});

// Store student details for logging
let student = null;

// Fetch student details for logging
async function fetchStudentDetails() {
 try {
  const response = await fetch("http://localhost:5000/api/student");
  student = await response.json();
  console.log("Student loaded:", student);
 } catch (error) {
  console.error("Failed to fetch student details:", error);
 }
}

// Log warning to backend
async function logWarningToBackend(violationType, message) {
 try {
  const timestamp = new Date().toISOString();
  const studentId = student ? student.id : "UNKNOWN";
  
  const response = await fetch("http://localhost:5000/api/exam-warnings", {
   method: "POST",
   headers: {
    "Content-Type": "application/json"
   },
   body: JSON.stringify({
    violationType,
    timestamp,
    studentId,
    message
   })
  });
  
  const data = await response.json();
  console.log("Warning logged to backend:", data);
 } catch (error) {
  console.error("Failed to log warning:", error);
 }
}

// Show notification function
function showNotification(message, duration = 3000) {
 const notificationBox = document.getElementById("notificationBox");
 const notificationText = document.getElementById("notificationText");
 
 notificationText.textContent = message;
 notificationBox.style.display = "block";
 notificationBox.style.animation = "slideDown 0.3s ease-in-out";
 
 // Auto hide after duration
 setTimeout(() => {
  notificationBox.style.animation = "slideUp 0.3s ease-in-out";
  setTimeout(() => {
   notificationBox.style.display = "none";
  }, 300);
 }, duration);
}

// Listen for Alt+Tab attempts
window.electronAPI.onWindowSwitched(()=>{
 const warningMsg = "\u26A0 WARNING: You cannot switch windows during the exam. Please focus on your test.";
 showNotification(warningMsg);
 logWarningToBackend("ALT_TAB_ATTEMPT", "Student attempted to switch windows using Alt+Tab");
});

// Listen for Windows key attempts
window.electronAPI.onWindowsKeyPressed(()=>{
 const warningMsg = "\u26A0 WARNING: Windows key is disabled during the exam. Please focus on your test.";
 showNotification(warningMsg);
 logWarningToBackend("WINDOWS_KEY_ATTEMPT", "Student attempted to press Windows/Meta key");
});

// RUN AFTER PAGE LOAD
window.onload = () => {

    fetchStudentDetails();
    loadExam();
    startCamera();
    window.electronAPI.startFullscreen();

};