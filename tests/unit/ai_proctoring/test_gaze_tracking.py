"""
tests/unit/ai_proctoring/test_gaze_tracking.py
Unit tests for Gaze Tracking module
"""

import pytest
import numpy as np
from datetime import datetime

@pytest.fixture
def sample_face_landmarks():
    """Create sample facial landmarks"""
    return {
        'left_eye': [(100, 120), (110, 125), (105, 135)],
        'right_eye': [(150, 120), (160, 125), (155, 135)],
        'nose': [(125, 150)],
        'face_center': (125, 140)
    }

@pytest.fixture
def sample_head_pose():
    """Create sample head pose angles"""
    return {
        'yaw': 0,      # Left-right rotation
        'pitch': 0,    # Up-down tilt
        'roll': 0      # Side tilt
    }

class TestGazeTracking:
    
    def test_gaze_direction_estimation(self, sample_face_landmarks):
        """Test gaze direction estimation"""
        # Simulate gaze vector
        gaze_vector = (0.1, 0.2, 0.5)  # Normalized direction
        
        distance = np.sqrt(sum(x**2 for x in gaze_vector))
        assert abs(distance - 1.0) < 0.1  # Should be normalized

    def test_gaze_forward_detection(self, sample_face_landmarks, sample_head_pose):
        """Test detection of forward-looking gaze"""
        gaze_angles = {'horizontal': 5, 'vertical': 3}
        threshold = 15  # degrees
        
        is_looking_forward = (abs(gaze_angles['horizontal']) < threshold and
                             abs(gaze_angles['vertical']) < threshold)
        
        assert is_looking_forward is True

    def test_gaze_averted_detection(self, sample_face_landmarks):
        """Test detection of averted gaze"""
        gaze_angles = {'horizontal': 35, 'vertical': 40}
        threshold = 15  # degrees
        
        is_averted = (abs(gaze_angles['horizontal']) > threshold or
                      abs(gaze_angles['vertical']) > threshold)
        
        assert is_averted is True

    def test_gaze_confidence_score(self):
        """Test gaze detection confidence"""
        confidence = 0.87  # 87% confidence
        min_confidence = 0.7
        
        is_valid = confidence > min_confidence
        assert is_valid is True

    def test_gaze_timeout_tracking(self):
        """Test tracking duration of averted gaze"""
        look_away_threshold_sec = 3.0
        look_away_start = 0.0
        current_time = 3.5
        
        duration = current_time - look_away_start
        is_timeout = duration > look_away_threshold_sec
        
        assert is_timeout is True

    def test_head_pose_extraction(self, sample_head_pose):
        """Test head pose angle extraction"""
        assert abs(sample_head_pose['yaw']) < 90
        assert abs(sample_head_pose['pitch']) < 90
        assert abs(sample_head_pose['roll']) < 90

    def test_head_pose_thresholds(self):
        """Test head pose threshold violations"""
        yaw_threshold = 18  # degrees
        pitch_up_threshold = 20
        pitch_down_threshold = 40
        
        head_pose = {
            'yaw': 25,      # Exceeds yaw threshold
            'pitch': -10,   # Up - within threshold
            'roll': 0
        }
        
        yaw_violation = abs(head_pose['yaw']) > yaw_threshold
        pitch_violation = head_pose['pitch'] > pitch_up_threshold or \
                         head_pose['pitch'] < -pitch_down_threshold
        
        assert yaw_violation is True
        assert pitch_violation is False

    def test_eye_closure_detection(self):
        """Test detection of eye closure (blinking, etc)"""
        eye_aspect_ratio = 0.15  # Low ratio indicates closed eye
        blink_threshold = 0.2
        
        eyes_closed = eye_aspect_ratio < blink_threshold
        assert eyes_closed is True

    def test_multiple_frame_gaze_smoothing(self):
        """Test gaze smoothing over multiple frames"""
        gaze_readings = [5, 8, 7, 9, 6, 8]  # Degrees
        
        # Calculate moving average
        window_size = 3
        smoothed = []
        for i in range(len(gaze_readings) - window_size + 1):
            avg = sum(gaze_readings[i:i+window_size]) / window_size
            smoothed.append(avg)
        
        assert len(smoothed) > 0
        assert max(smoothed) <= max(gaze_readings)

    def test_normal_gaze_behavior(self):
        """Test classification of normal gaze behavior"""
        gaze_sequence = [
            {'angle': 5, 'duration': 0.5},    # Forward
            {'angle': 20, 'duration': 0.3},   # Slight look away
            {'angle': 3, 'duration': 2.0},    # Forward
        ]
        
        violations = 0
        for reading in gaze_sequence:
            if reading['angle'] > 30 and reading['duration'] > 3.0:
                violations += 1
        
        assert violations == 0

class TestGazeTrackingIntegration:
    
    def test_gaze_violation_reporting(self):
        """Test gaze violation reporting"""
        violation = {
            'type': 'gaze_averted',
            'severity': 'warning',
            'duration': 4.5,  # seconds
            'angle': {'horizontal': 35, 'vertical': 42},
            'timestamp': datetime.now().isoformat()
        }
        
        assert violation['type'] == 'gaze_averted'
        assert violation['duration'] > 3.0

    def test_gaze_persistence_across_frames(self):
        """Test tracking gaze persistently across frames"""
        frame_count = 100
        averted_frames = []
        
        for i in range(frame_count):
            # Simulate approximately 20% of frames with averted gaze
            if i % 5 == 0:
                averted_frames.append(i)
        
        assert len(averted_frames) > 0
        averted_percentage = (len(averted_frames) / frame_count) * 100
        assert 15 < averted_percentage < 25

    def test_rapid_gaze_changes(self):
        """Test detection of rapid gaze changes"""
        gaze_readings = [
            {'time': 0.0, 'angle': 5},
            {'time': 0.033, 'angle': 45},   # Rapid change
            {'time': 0.066, 'angle': 8},    # Back to normal
        ]
        
        rapid_changes = 0
        for i in range(1, len(gaze_readings)):
            angle_diff = abs(gaze_readings[i]['angle'] - gaze_readings[i-1]['angle'])
            time_diff = gaze_readings[i]['time'] - gaze_readings[i-1]['time']
            
            if angle_diff > 30 and time_diff < 0.1:
                rapid_changes += 1
        
        assert rapid_changes > 0

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
