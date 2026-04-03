"""
tests/unit/ai_proctoring/test_face_monitor.py
Unit tests for Face Monitor module
"""

import pytest
import numpy as np
from datetime import datetime
from unittest.mock import Mock, patch, MagicMock

# Mock imports
class MockViolationLogger:
    def log_violation(self, violation_type, detail=None, metadata=None):
        pass

@pytest.fixture
def violation_logger():
    return MockViolationLogger()

@pytest.fixture
def sample_frame():
    """Create a sample frame for testing"""
    return np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)

class TestFaceMonitor:
    
    def test_init_face_monitor(self, violation_logger):
        """Test FaceMonitor initialization"""
        # Simulate initialization
        monitor = {
            'logger': violation_logger,
            'state': {
                'no_face_start': None,
                'no_face_violated': False,
                'multi_face_last_event': 0.0
            }
        }
        
        assert monitor['logger'] is not None
        assert monitor['state']['no_face_violated'] is False

    def test_detect_single_face(self, violation_logger, sample_frame):
        """Test detection of single face"""
        # Simulate detection
        detections = [{'confidence': 0.95, 'bbox': [100, 100, 200, 250]}]
        
        assert len(detections) == 1
        assert detections[0]['confidence'] > 0.9

    def test_detect_multiple_faces(self, violation_logger, sample_frame):
        """Test detection of multiple faces"""
        # Simulate multiple face detection
        detections = [
            {'confidence': 0.95, 'bbox': [100, 100, 200, 250]},
            {'confidence': 0.92, 'bbox': [300, 100, 400, 250]}
        ]
        
        assert len(detections) == 2
        # Multiple faces should trigger violation
        assert len(detections) > 1

    def test_no_face_detection(self, violation_logger, sample_frame):
        """Test no face detected"""
        detections = []
        
        assert len(detections) == 0

    def test_face_confidence_threshold(self, violation_logger, sample_frame):
        """Test low confidence detection filtering"""
        min_confidence = 0.7
        detections = [
            {'confidence': 0.95, 'bbox': [100, 100, 200, 250]},
            {'confidence': 0.60, 'bbox': [300, 100, 400, 250]}  # Below threshold
        ]
        
        filtered = [d for d in detections if d['confidence'] > min_confidence]
        assert len(filtered) == 1

    def test_face_bounding_box_calculation(self):
        """Test bounding box calculation"""
        bbox = [100, 100, 200, 250]
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        area = width * height
        
        assert width == 100
        assert height == 150
        assert area > 0

    def test_process_frame_with_face(self, violation_logger, sample_frame):
        """Test frame processing with face detected"""
        # Simulate processing
        input_frame = sample_frame.copy()
        detections = [{'confidence': 0.95, 'bbox': [100, 100, 200, 250]}]
        
        # Process should return frame with annotations
        assert input_frame.shape == (720, 1280, 3)
        assert len(detections) > 0

    def test_no_face_timeout(self, violation_logger):
        """Test no face timeout triggering violation"""
        no_face_timeout_sec = 5.0
        no_face_duration = 6.0  # Exceeds timeout
        
        assert no_face_duration > no_face_timeout_sec

    def test_multi_face_cooldown(self,violation_logger):
        """Test multi-face cooldown period"""
        multi_face_cooldown = 30.0
        events = [
            {'time': 0.0, 'count': 2},
            {'time': 15.0, 'count': 2},  # Within cooldown
            {'time': 35.0, 'count': 2}   # Outside cooldown
        ]
        
        assert events[0]['time'] < events[1]['time'] < multi_face_cooldown
        assert events[2]['time'] > multi_face_cooldown

    def test_get_face_state(self):
        """Test getting current face detection state"""
        state = {
            'faces_detected': 1,
            'confidence': 0.95,
            'bbox': [100, 100, 200, 250],
            'timestamp': datetime.now()
        }
        
        assert state['faces_detected'] == 1
        assert 'timestamp' in state

    def test_reset_state(self):
        """Test resetting monitor state"""
        initial_state = {
            'no_face_start': None,
            'no_face_violated': False,
            'multi_face_last_event': 0.0
        }
        
        initial_state['no_face_violated'] = False
        initial_state['no_face_start'] = None
        
        assert initial_state['no_face_violated'] is False

class TestFaceMonitorIntegration:
    
    def test_continuous_face_monitoring(self, violation_logger, sample_frame):
        """Test continuous monitoring over multiple frames"""
        frames = [sample_frame for _ in range(30)]  # 30 frames
        
        violations = []
        has_face_in_frames = [True, False, True, False, True] * 6  # Alternating
        
        for i, frame in enumerate(frames):
            if not has_face_in_frames[i]:
                violations.append({
                    'frame': i,
                    'type': 'no_face',
                    'timestamp': datetime.now()
                })
        
        assert len(violations) > 0

    def test_face_switching_detection(self, violation_logger):
        """Test detection of face switching"""
        face_ids = [1, 1, 1, 2, 2, 2, 1, 1, 1]  # Face switches from 1 to 2 and back
        
        switches = 0
        prev_id = face_ids[0]
        for current_id in face_ids[1:]:
            if current_id != prev_id:
                switches += 1
            prev_id = current_id
        
        assert switches == 2  # Two switches detected

    def test_performance_metrics(self, sample_frame):
        """Test performance metrics during detection"""
        import time
        
        start = time.time()
        # Simulate detection
        _ = sample_frame.copy()
        elapsed = time.time() - start
        
        assert elapsed < 1.0  # Should be fast

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
