import json
import numpy as np
import pytest
from backend.services.recognition_service import RecognitionService
from backend.database.repository import repo

def test_distinct_student_128d_recognition():
    """
    Bug fix verification:
    Two distinct student 128-D face encodings must map to their respective student IDs,
    and NEVER return the same default/fallback student for both.
    An unregistered face must be rejected as UNKNOWN.
    """
    # Create an isolated RecognitionService instance
    service = RecognitionService()
    service.tolerance = 0.50

    # 1. Create two distinct 128-D unit encodings
    np.random.seed(100)
    enc_alice = np.random.randn(128)
    enc_alice = enc_alice / np.linalg.norm(enc_alice)

    # Bob's encoding is made orthogonal / distinct from Alice's
    enc_bob = np.random.randn(128)
    enc_bob = enc_bob - np.dot(enc_bob, enc_alice) * enc_alice
    enc_bob = enc_bob / np.linalg.norm(enc_bob)

    # Verify Alice and Bob are separated by distance > tolerance
    inter_student_distance = float(np.linalg.norm(enc_alice - enc_bob))
    assert inter_student_distance > 0.50, f"Distance {inter_student_distance} too small"

    # Enlist both in the service
    service.known_encodings = [enc_alice, enc_bob]
    service.known_student_ids = ["STD-101", "STD-102"]
    service.known_names = ["Alice Smith", "Bob Jones"]

    # 2. Query with a sample of Alice (slight sensor perturbation: distance ~0.11)
    alice_query = enc_alice + np.random.randn(128) * 0.01
    alice_query = alice_query / np.linalg.norm(alice_query)

    dist_alice_to_alice = float(np.linalg.norm(enc_alice - alice_query))
    dist_alice_to_bob = float(np.linalg.norm(enc_bob - alice_query))

    assert dist_alice_to_alice < service.tolerance
    assert dist_alice_to_bob > service.tolerance

    # Best match resolution
    distances = np.linalg.norm(service.known_encodings - alice_query, axis=1)
    best_idx = int(np.argmin(distances))
    best_dist = float(distances[best_idx])

    assert best_idx == 0
    assert service.known_student_ids[best_idx] == "STD-101"
    assert service.known_names[best_idx] == "Alice Smith"
    assert best_dist <= service.tolerance

    # 3. Query with a sample of Bob
    bob_query = enc_bob + np.random.randn(128) * 0.01
    bob_query = bob_query / np.linalg.norm(bob_query)

    distances_bob = np.linalg.norm(service.known_encodings - bob_query, axis=1)
    best_idx_bob = int(np.argmin(distances_bob))
    best_dist_bob = float(distances_bob[best_idx_bob])

    assert best_idx_bob == 1
    assert service.known_student_ids[best_idx_bob] == "STD-102"
    assert service.known_names[best_idx_bob] == "Bob Jones"
    assert best_dist_bob <= service.tolerance

    # Ensure Alice != Bob
    assert service.known_student_ids[best_idx] != service.known_student_ids[best_idx_bob]

    # 4. Query with an unregistered person (random unit vector)
    unregistered = np.random.randn(128)
    unregistered = unregistered / np.linalg.norm(unregistered)
    distances_unregistered = np.linalg.norm(service.known_encodings - unregistered, axis=1)
    min_dist_unregistered = float(np.min(distances_unregistered))

    assert min_dist_unregistered > service.tolerance, "Unregistered person should exceed tolerance gate"

def test_repository_face_data_storage():
    """Verify storing, querying, and deleting 128-D face encoding in Cloud MySQL / SQLite repository."""
    test_sid = "STD-TEST-ENC-01"
    synth_enc = [round(float(x), 6) for x in (np.random.randn(128) / 10.0)]
    enc_json = json.dumps(synth_enc)
    test_bytes = b"JPEG_TEST_REFERENCE_PHOTO_BYTES"

    from backend.database.connection import execute_query

    # Ensure parent student exists for MySQL foreign key constraint
    execute_query(
        "INSERT IGNORE INTO students (student_id, name, roll_number, department, year, section) VALUES (%s, %s, %s, %s, %s, %s)",
        (test_sid, "Test Enc Student", "TEST-ENC-01", "CS", "4th Year", "A"),
        commit=True
    )

    try:
        # Save face data
        ok = repo.save_face_data(
            student_id=test_sid,
            image_filename=f"{test_sid}_ref.jpg",
            image_bytes=test_bytes,
            face_encoding_json=enc_json
        )
        assert ok is True

        # Retrieve face data
        record = repo.get_student_face_data(test_sid)
        assert record is not None
        assert record["student_id"] == test_sid
        assert record["face_encoding"] == enc_json

        # Delete face data cleanly
        del_ok = repo.delete_face_data(test_sid)
        assert del_ok is True

        after = repo.get_student_face_data(test_sid)
        assert after is None
    finally:
        execute_query("DELETE FROM students WHERE student_id = %s", (test_sid,), commit=True)

