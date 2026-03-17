window.onload = async function(){

 const res = await fetch("http://localhost:5000/api/student")

 const student = await res.json()

 document.getElementById("studentName").innerText = student.name
 document.getElementById("examName").innerText = student.exam

 console.log("Dashboard loaded. Permissions already granted during login.");

}

function startExam(){

 window.location="exam.html"

}

// Disable right click
document.addEventListener("contextmenu", e => e.preventDefault());

// Disable copy/paste/cut
document.addEventListener("copy", e => e.preventDefault());
document.addEventListener("cut", e => e.preventDefault());
document.addEventListener("paste", e => e.preventDefault());

// Disable keyboard shortcuts for copy/cut/paste
document.addEventListener("keydown", function(e) {
 if (e.ctrlKey && (e.key === "c" || e.key === "x" || e.key === "v")) {
  e.preventDefault();
 }
});