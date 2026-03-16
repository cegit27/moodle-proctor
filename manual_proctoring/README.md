
# 📁 Project Setup

## 1. Create the Project Folder

mkdir proctoring-app
cd proctoring-app


Inside the **proctoring-app** folder, place all the files from this repository.

---

# 📂 Project Structure

```
proctoring-app
│
├── main.js
├── preload.js
├── package.json
│
└── renderer
     │
     ├── login.html
     ├── dashboard.html
     ├── exam.html
     │
     ├── js
     │    ├── login.js
     │    ├── dashboard.js
     │    └── exam.js
     │
     └── css
          └── style.css
```

---

# 📦 Install Dependencies

Install the required packages:

npm install electron --save-dev
npm install axios


---

# ▶️ Run the Electron Application

npm start

---

# 🧪 Dummy Backend for Testing

Until the real backend APIs are available, a **temporary backend server** is provided for testing.

## Updated Project Structure

```
proctoring-app
│
├── backend
│    └── server.js
│
├── main.js
├── preload.js
├── package.json
│
└── renderer
     │
     ├── login.html
     ├── dashboard.html
     ├── exam.html
     │
     ├── js
     │    ├── login.js
     │    ├── dashboard.js
     │    └── exam.js
     │
     └── css
          └── style.css
```

---

# ⚙️ Run the Dummy Backend

Open **a new terminal** and run:

cd backend
npm init -y
npm install express cors
node server.js


---

# 🚀 Development Workflow

Run the system using **two terminals**.

### Terminal 1 – Backend

cd backend
node server.js

### Terminal 2 – Electron App


npm start


### Inside application
(Data values given in backend)
# Email : asif@gmail.com
# Password : 1234 



