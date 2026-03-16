"""Speech monitoring module for an AI exam proctoring system.

This script listens to the system microphone continuously and raises a
warning whenever human speech is detected. It is structured so the monitor
can be reused inside a larger proctoring application.

Dependencies:
    pip install SpeechRecognition PyAudio
"""

from __future__ import annotations

import logging
import json
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Optional
from urllib import error, request

import speech_recognition as sr


SpeechEventHandler = Callable[[str, str], None]


@dataclass
class SpeechMonitorConfig:
    """Configuration for the speech monitor."""

    phrase_time_limit: int = 4
    silence_poll_seconds: int = 2
    ambient_adjustment_seconds: int = 1
    energy_threshold: int = 300
    dynamic_energy_threshold: bool = True
    warning_message: str = "Warning: Speech detected during the exam."
    log_file: str = "speech_detection.log"
    backend_event_url: Optional[str] = "http://127.0.0.1:8000/speech-event"
    backend_timeout_seconds: int = 5


class ProctoringEventClient:
    """Sends proctoring events to a backend service."""

    def __init__(self, endpoint_url: Optional[str], timeout_seconds: int = 5) -> None:
        self.endpoint_url = endpoint_url
        self.timeout_seconds = timeout_seconds

    def send_speech_event(self, timestamp: str, transcript: str) -> bool:
        """Send a speech detection event to the configured backend."""
        if not self.endpoint_url:
            return False

        payload = json.dumps(
            {
                "event_type": "speech_detected",
                "timestamp": timestamp,
                "transcript": transcript,
            }
        ).encode("utf-8")

        req = request.Request(
            self.endpoint_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=self.timeout_seconds):
                return True
        except (error.URLError, error.HTTPError):
            return False


class SpeechMonitor:
    """Continuously monitors microphone input for speech activity."""

    def __init__(
        self,
        config: Optional[SpeechMonitorConfig] = None,
        on_speech_detected: Optional[SpeechEventHandler] = None,
    ) -> None:
        self.config = config or SpeechMonitorConfig()
        self.on_speech_detected = on_speech_detected or self._default_speech_handler
        self.recognizer = sr.Recognizer()
        self.event_client = ProctoringEventClient(
            endpoint_url=self.config.backend_event_url,
            timeout_seconds=self.config.backend_timeout_seconds,
        )
        self.recognizer.energy_threshold = self.config.energy_threshold
        self.recognizer.dynamic_energy_threshold = self.config.dynamic_energy_threshold
        self._is_running = False

        self.logger = logging.getLogger(self.__class__.__name__)
        self._configure_logging()

    def _configure_logging(self) -> None:
        """Configure console and file logging once."""
        if self.logger.handlers:
            return

        self.logger.setLevel(logging.INFO)
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

        file_handler = logging.FileHandler(self.config.log_file, encoding="utf-8")
        file_handler.setFormatter(formatter)

        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setFormatter(formatter)

        self.logger.addHandler(file_handler)
        self.logger.addHandler(stream_handler)

    def start(self) -> None:
        """Start continuous monitoring of the system microphone."""
        self.logger.info("Starting speech monitor.")

        try:
            with sr.Microphone() as source:
                self._prepare_microphone(source)
                self._is_running = True

                while self._is_running:
                    self._monitor_once(source)
        except OSError as exc:
            self.logger.error("Unable to access the microphone: %s", exc)
        except KeyboardInterrupt:
            self.logger.info("Speech monitor stopped by user.")
        finally:
            self._is_running = False
            self.logger.info("Speech monitor stopped.")

    def stop(self) -> None:
        """Stop continuous monitoring."""
        self._is_running = False

    def _prepare_microphone(self, source: sr.Microphone) -> None:
        """Calibrate the recognizer to current ambient noise."""
        self.logger.info("Calibrating microphone for ambient noise...")
        self.recognizer.adjust_for_ambient_noise(
            source,
            duration=self.config.ambient_adjustment_seconds,
        )
        self.logger.info("Microphone calibration complete.")

    def _monitor_once(self, source: sr.Microphone) -> None:
        """Listen for one monitoring cycle and process detected audio."""
        try:
            audio = self.recognizer.listen(
                source,
                timeout=self.config.silence_poll_seconds,
                phrase_time_limit=self.config.phrase_time_limit,
            )
        except sr.WaitTimeoutError:
            self.logger.debug("Silence detected. Continuing monitoring.")
            return

        self._process_audio(audio)

    def _process_audio(self, audio: sr.AudioData) -> None:
        """Check whether captured audio contains human speech."""
        try:
            transcript = self.recognizer.recognize_google(audio)
            if transcript.strip():
                timestamp = datetime.now().isoformat(timespec="seconds")
                self.logger.warning("Speech detected at %s", timestamp)
                self.on_speech_detected(timestamp, transcript)
                if self.event_client.send_speech_event(timestamp, transcript):
                    self.logger.info("Speech event sent to backend.")
                else:
                    self.logger.warning("Speech event could not be sent to backend.")
        except sr.UnknownValueError:
            self.logger.debug("Audio detected, but no clear speech was recognized.")
        except sr.RequestError as exc:
            self.logger.error("Speech recognition service error: %s", exc)
            time.sleep(1)
        except Exception as exc:  # Defensive handling for integration safety.
            self.logger.exception("Unexpected audio processing error: %s", exc)

    def _default_speech_handler(self, timestamp: str, transcript: str) -> None:
        """Default action taken when speech is detected."""
        print(f"[{timestamp}] {self.config.warning_message}")
        print(f"Recognized speech: {transcript}")


if __name__ == "__main__":
    monitor = SpeechMonitor()
    monitor.start()
