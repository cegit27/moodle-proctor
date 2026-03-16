window.onload = async function(){

 const res = await fetch("http://localhost:5000/api/student")

 const student = await res.json()

 document.getElementById("studentName").innerText = student.name
 document.getElementById("examName").innerText = student.exam

}


function startExam(){

 window.location="exam.html"

}