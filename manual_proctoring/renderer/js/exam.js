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
v
}
    }, 1000);

}

async function startCamera() {

    try {

        const video = document.getElementById("video");

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
        alert("Please allow camera permission for the exam.");

    }

}

// Disable right click
document.addEventListener("contextmenu", e => e.preventDefault());

// Disable copy
document.addEventListener("copy", e => e.preventDefault());

// Disable Print (Ctrl + P)
document.addEventListener("keydown", function(e) {

    if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        alert("Printing is disabled during exam");
    }

});


// RUN AFTER PAGE LOAD
window.onload = () => {

    loadExam();
    startCamera();
    window.electronAPI.startFullscreen();

};