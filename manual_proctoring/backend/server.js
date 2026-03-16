const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());


// Dummy student data
const student = {
 id: "ST101",
 name: "Asif",
 email: "asif@gmail.com",
 exam: "IoT Final Exam"
}


// LOGIN API
app.post("/api/login",(req,res)=>{

 const {email,password} = req.body

 if(email==="asif@gmail.com" && password==="1234"){
  
  res.json({
   success:true,
   token:"dummy_token_123"
  })

 }else{

  res.status(401).json({
   success:false,
   message:"Invalid credentials"
  })

 }

})


// FETCH STUDENT DETAILS
app.get("/api/student",(req,res)=>{

 res.json(student)

})


// serve files folder
app.use("/files", express.static(path.join(__dirname, "files")));

// exam API
app.get("/exam", (req, res) => {
    res.json({
        timer: 10,
        questionPaper: "question-paper.pdf"
    });
});

app.listen(5000, () => {
    console.log("Server running at http://localhost:5000");
});









// FETCH QUESTIONS
app.get("/api/questions",(req,res)=>{

 res.json([
  {
   id:1,
   question:"What does IoT stand for?",
   options:[
    "Internet of Things",
    "Input Output Technology",
    "Internet Tool",
    "None"
   ]
  },
  {
   id:2,
   question:"Which protocol is used in IoT?",
   options:[
    "MQTT",
    "HTTP",
    "CoAP",
    "All of the above"
   ]
  }
 ])

})


app.listen(5000,()=>{
 console.log("Dummy API running on port 5000")
})