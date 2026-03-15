# Proctor Media Server

This is a WebRTC-based live video streaming server designed for proctoring exams. It allows a "teacher" to monitor multiple "students" simultaneously by viewing their webcams, screens, and listening to their microphones.

[Project Reference Link](https://annauniv0-my.sharepoint.com/:x:/g/personal/2023115101_student_annauniv_edu/IQDE8dGryrJQSqTz0DLb3jv7AZVVNMtv_lWQgyhpcH-ks0E?e=vdgbfB)

## Tech Stack Used

- **Node.js**: Backend JavaScript runtime.
- **Mediasoup**: Extremely powerful C++ based WebRTC Selective Forwarding Unit (SFU) for scaling concurrent media tracks (audio/video).
- **Socket.IO**: Real-time websocket communication between the client and server for handshakes and media negotiations.
- **Redis & ioredis**: Used as a fast, in-memory store to manage state variables, room creation, and peer tracking.
- **Browserify & ESBuild**: Front-end module bundlers to compile Mediasoup-client functionality for raw HTML pages.
- **Vanilla HTML/CSS/JS**: Creates the streamlined user interface inside `test-ui`. 

## How It Works (The Architecture)

1. **Signaling & Handshakes:**
   - Both the Teacher and Student connect to the server over a `Socket.IO` websocket.
   - They identify themselves (e.g. `studentId`, `role` as "Teacher" or "Student", and `examId`).
   - The Server maps them to a specific "Room" associated with the `examId`.

2. **WebRTC Transports via Mediasoup:**
   - Instead of routing peer-to-peer (which fails at scale), the clients ask Mediasoup to create a **Transport Pipeline**.
   - `SendTransports` are created for uploading your media *(e.g. Student's Camera & Screen)*.
   - `RecvTransports` are created for downloading media *(e.g. Teacher watching the Student)*.

3. **Publishing (Producing) Streams:**
   - After a `SendTransport` is configured, the browser invokes the `navigator.mediaDevices` API.
   - The Student selects their Screen, Mic, or WebCam, which generates raw data tracks.
   - These tracks are published to the Server as **Producers** (`screenProducer`, `camProducer`, `micProducer`).
   - The server accepts the uploads and attaches `.appData` tags to track *which* stream is which.

4. **Subscribing (Consuming) Streams:**
   - Whenever any new Producer stream hits the server, the server shouts to everyone else in the room through the Socket: `"new-producer exists!"`
   - Those peers then trigger their `RecvTransport` pipeline to fetch that stream.
   - Mediasoup seamlessly forwards the packet chunks down to the listener, dynamically converting it back into a viewable `<video>` or `<audio>` track inside the DOM.

## Local Development Checklist

1. Make sure you have installed standard **Node.js**.
2. Run `npm install` to download dependencies.
3. Keep an instance of **Redis Server** actively running locally on port `6379`.
   - Setup a `.env` dynamically via `.env.example`.
4. Boot up using `npm start`
5. Visit `http://localhost:4001` in your browser.
