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

  window.location="dashboard.html"

 }else{

  alert("Invalid login")

 }

}