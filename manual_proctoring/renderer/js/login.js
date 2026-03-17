async function login(){

 const email=document.getElementById("email").value
 const password=document.getElementById("password").value

 const res = await fetch("http://localhost:5000/api/login",{
  method:"POST",
  headers:{
   "Content-Type":"application/json"
  },
  body:JSON.stringify({email,password})
 })

 const data = await res.json()

 if(data.success){

  localStorage.setItem("token",data.token)

  // Request media permissions immediately after login
  await requestMediaPermissions();

  // Then navigate to dashboard
  window.location="dashboard.html"

 }else{

  alert("Invalid login")

 }

}

// Request camera and microphone permissions
async function requestMediaPermissions() {
 try {
  const stream = await navigator.mediaDevices.getUserMedia({
   video: true,
   audio: true
  });
  
  // Stop the stream immediately after getting permission
  stream.getTracks().forEach(track => track.stop());
  
  console.log("✓ Camera and microphone permissions granted");
 } catch (error) {
  console.warn("User denied camera/microphone permission:", error);
  alert("Please allow camera and microphone permissions to proceed with the exam.");
 }
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