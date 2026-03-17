"""
AI Proctoring System v3 — WebSocket Edition
Replaces cv2.VideoCapture with frames streamed from the browser.
"""
import asyncio, base64, cv2, numpy as np, time, sys
from datetime import datetime
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

import config as C
from violation_logger import ViolationLogger
from utils import draw_status_overlay, ensure_directories

# ── Conditional imports ────────────────────────────────────────────────────────
if C.ENABLE_FACE_MONITOR:    from face_monitor      import FaceMonitor
if C.ENABLE_GAZE_TRACKING:   from gaze_tracking     import GazeTracker
if C.ENABLE_PHONE_DETECTION: from phone_detection   import PhoneDetector
if C.ENABLE_OBJECT_DETECT:   from object_detection  import ObjectDetector
if C.ENABLE_AUDIO_MONITOR:   from audio_monitor     import AudioMonitor
if C.ENABLE_BLINK_MONITOR:   from blink_monitor     import BlinkMonitor
if C.ENABLE_LIP_MONITOR:     from lip_movement      import LipMovementMonitor
if C.ENABLE_TAB_MONITOR:     from tab_monitor       import TabMonitor
if C.ENABLE_LIGHTING_MONITOR:from lighting_monitor  import LightingMonitor
if C.ENABLE_MOTION_DETECT:   from motion_detector   import MotionDetector
if C.ENABLE_IDENTITY_VERIFY: from identity_verifier import IdentityVerifier


# ── App + CORS (allow your frontend origin) ────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global state (shared across WebSocket connections) ─────────────────────────
ensure_directories()
session_start = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

print(f"\n{'='*60}")
print(f"  AI PROCTORING SYSTEM v3 — WebSocket Edition")
print(f"  Candidate : {C.CANDIDATE_ID}")
print(f"  Exam      : {C.EXAM_NAME}")
print(f"  Strictness: {C.STRICTNESS.upper()}")
print(f"{'='*60}\n")
print("[INFO] Initialising AI modules ...")

logger            = ViolationLogger(C.LOG_FILE)
face_monitor      = FaceMonitor(logger)          if C.ENABLE_FACE_MONITOR     else None
gaze_tracker      = GazeTracker(logger)          if C.ENABLE_GAZE_TRACKING    else None
phone_detector    = PhoneDetector(logger)        if C.ENABLE_PHONE_DETECTION  else None
object_detector   = ObjectDetector(logger)       if C.ENABLE_OBJECT_DETECT    else None
audio_monitor     = AudioMonitor(logger)         if C.ENABLE_AUDIO_MONITOR    else None
blink_monitor     = BlinkMonitor(logger)         if C.ENABLE_BLINK_MONITOR    else None
lip_monitor       = LipMovementMonitor(logger)   if C.ENABLE_LIP_MONITOR      else None
tab_monitor       = TabMonitor(logger)           if C.ENABLE_TAB_MONITOR      else None
lighting_monitor  = LightingMonitor(logger)      if C.ENABLE_LIGHTING_MONITOR else None
motion_detector   = MotionDetector(logger)       if C.ENABLE_MOTION_DETECT    else None
identity_verifier = IdentityVerifier(logger)     if C.ENABLE_IDENTITY_VERIFY  else None

print("[INFO] All modules ready. Waiting for WebSocket connections...\n")


# ── Per-connection state ───────────────────────────────────────────────────────
class SessionState:
    def __init__(self):
        self.frame_count   = 0
        self.fps_timer     = time.time()
        self.display_fps   = 0.0
        self.last_face_bbox = None


# ── WebSocket endpoint ─────────────────────────────────────────────────────────
@app.websocket("/proctor")
async def proctor_ws(websocket: WebSocket):
    await websocket.accept()
    state = SessionState()
    print(f"[INFO] Client connected: {websocket.client}")

    try:
        while True:
            data      = await websocket.receive_json()
            img_bytes = base64.b64decode(data["frame"])
            np_arr    = np.frombuffer(img_bytes, np.uint8)
            frame     = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if frame is None:
                await websocket.send_json({"error": "bad frame"})
                continue

            result = _process_frame(frame, state)
            await websocket.send_json(result)

    except Exception as exc:
        print(f"[WARN] Connection closed: {exc}")
    finally:
        print(f"[INFO] Client disconnected. Frames processed: {state.frame_count}")


def _process_frame(frame: np.ndarray, state: SessionState) -> dict:
    """Run all detectors on a single frame; return a JSON-serialisable result dict."""
    state.frame_count += 1
    annotated = frame.copy()
    h, w      = frame.shape[:2]

    # FPS counter
    if state.frame_count % 30 == 0:
        elapsed          = time.time() - state.fps_timer
        state.display_fps = 30.0 / elapsed if elapsed > 0 else 0.0
        state.fps_timer  = time.time()

    # ── 1. Face ────────────────────────────────────────────────────────────────
    face_result = {}
    if face_monitor:
        face_result = face_monitor.process(frame, annotated, state.frame_count)
        state.last_face_bbox = getattr(face_monitor, '_last_bbox', None)

    # ── 2. Gaze + landmarks ────────────────────────────────────────────────────
    gaze_result = {}
    landmarks   = None
    if gaze_tracker:
        gaze_result = gaze_tracker.process(frame, annotated, state.frame_count)
        landmarks   = gaze_result.get("landmarks")

    # ── 3. Phone ───────────────────────────────────────────────────────────────
    phone_result = {}
    if phone_detector:
        phone_result = phone_detector.process(frame, annotated, state.frame_count)

    # ── 4. Forbidden objects ───────────────────────────────────────────────────
    object_result = {}
    if object_detector:
        object_result = object_detector.process(frame, annotated, state.frame_count)

    # ── 5. Blink rate ──────────────────────────────────────────────────────────
    blink_result = {}
    if blink_monitor and landmarks:
        blink_result = blink_monitor.process(landmarks, frame, annotated,
                                              state.frame_count, w, h)

    # ── 6. Lip movement ────────────────────────────────────────────────────────
    lip_result = {}
    if lip_monitor and landmarks:
        lip_result = lip_monitor.process(landmarks, frame, annotated,
                                          state.frame_count, w, h)

    # ── 7. Lighting ────────────────────────────────────────────────────────────
    light_result = {}
    if lighting_monitor:
        light_result = lighting_monitor.process(frame, annotated, state.frame_count)

    # ── 8. Background motion ───────────────────────────────────────────────────
    motion_result = {}
    if motion_detector:
        motion_result = motion_detector.process(frame, annotated,
                                                 state.frame_count, state.last_face_bbox)

    # ── 9. Identity ────────────────────────────────────────────────────────────
    identity_result = {}
    if identity_verifier and landmarks:
        identity_result = identity_verifier.process(landmarks, frame, annotated,
                                                     state.frame_count, w, h)

    # ── Optional: save annotated preview locally ───────────────────────────────
    if C.SHOW_PREVIEW:
        status = {
            "fps":        state.display_fps,
            "frame":      state.frame_count,
            "faces":      face_result.get("face_count", 0),
            "gaze":       gaze_result.get("gaze_status", "N/A"),
            "phone":      phone_result.get("phone_detected", False),
            "objects":    object_result.get("count", 0),
            "audio":      getattr(audio_monitor,  "status", "OFF"),
            "blink_bpm":  blink_result.get("blink_rate", 0.0),
            "lip":        lip_result.get("lip_status", "N/A"),
            "tab":        getattr(tab_monitor,     "status", "N/A"),
            "light":      light_result.get("status", "N/A"),
            "motion":     motion_result.get("status", "N/A"),
            "identity":   identity_result.get("identity_status", "N/A"),
            "violations": logger.total_violations,
            "timestamp":  datetime.now().strftime("%H:%M:%S"),
        }
        draw_status_overlay(annotated, status)
        cv2.imshow("AI Proctoring System v3", annotated)
        cv2.waitKey(1)

    # ── Build response for the frontend ───────────────────────────────────────
        # ── Build response for the frontend ───────────────────────────────────────
        violations = []

        # 1. Face presence
        if face_result.get("face_count", 1) == 0:
            violations.append("No face detected")
        if face_result.get("face_count", 1) > 1:
            violations.append("Multiple faces detected")

        # 2. Gaze
        if gaze_result.get("gaze_status") == "looking_away":
            violations.append("Looking away from screen")

        # 3. Phone
        if phone_result.get("phone_detected"):
            violations.append("Phone detected")

        # 4. Forbidden objects
        if object_result.get("count", 0) > 0:
            labels = object_result.get("labels", [])
            detail = f"Forbidden object detected: {', '.join(labels)}" if labels else "Forbidden object detected"
            violations.append(detail)

        # 5. Blink anomaly
        if blink_result.get("anomaly"):
            violations.append("Abnormal blink rate detected")

        # 6. Lip movement / talking
        if lip_result.get("lip_status") == "talking":
            violations.append("Talking detected")

        # 7. Lighting / camera blocked
        if light_result.get("status") == "blocked":
            violations.append("Camera may be blocked")
        if light_result.get("status") == "too_dark":
            violations.append("Lighting too dark — face not visible")

        # 8. Background motion
        if motion_result.get("status") == "motion_detected":
            violations.append("Background movement detected")

        # 9. Identity mismatch
        if identity_result.get("identity_status") == "mismatch":
            violations.append("Identity could not be verified")

    return {
        "frame":      state.frame_count,
        "fps":        round(state.display_fps, 1),
        "violations": violations,
        "flag":       len(violations) > 0,
        "message":    violations[0] if violations else "OK",
        "details": {
            "face":     face_result,
            "gaze":     gaze_result,
            "phone":    phone_result,
            "blink":    blink_result,
            "lip":      lip_result,
            "lighting": light_result,
            "motion":   motion_result,
            "identity": identity_result,
        }
    }


# ── Report on shutdown (Ctrl+C) ────────────────────────────────────────────────
@app.on_event("shutdown")
async def on_shutdown():
    if audio_monitor: audio_monitor.stop()
    if tab_monitor:   tab_monitor.stop()
    logger.close()
    cv2.destroyAllWindows()
    try:
        from report_generator import generate_report
        report_path = generate_report(
            log_path      = C.LOG_FILE,
            output_path   = f"report_{C.CANDIDATE_ID}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
            session_start = session_start,
            candidate_id  = C.CANDIDATE_ID,
            exam_name     = C.EXAM_NAME,
            institution   = C.INSTITUTION,
            strictness    = C.STRICTNESS,
        )
        print(f"[INFO] PDF report saved: {report_path}")
    except Exception as exc:
        print(f"[WARN] PDF generation failed: {exc}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)