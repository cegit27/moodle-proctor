window.onload = async function () {
  const token = localStorage.getItem('token')
  if (!token) {
    window.location = 'login.html'
    return
  }

  const res = await fetch('http://localhost:5000/api/student', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location = 'login.html'
    return
  }

  const student = await res.json()

  document.getElementById('studentName').innerText = student.name
  document.getElementById('examName').innerText = student.exam
}

function startExam () {
  window.location = 'exam.html'
}
