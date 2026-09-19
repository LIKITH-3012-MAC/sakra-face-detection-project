#!/usr/bin/env bash
set -e

echo "=== SAKRA-LENS BACKEND PRODUCTION BUILD ==="
echo "Upgrading pip..."
pip install --upgrade pip

echo "Installing base dependencies from requirements.txt..."
pip install -r requirements.txt

echo "Installing face-recognition binary without source compilation..."
pip install --no-deps "face-recognition>=1.3.0"

echo "Verifying face_recognition module import..."
python -c "import face_recognition; import dlib; print('[SAKRA] face_recognition & dlib successfully verified!')"

echo "=== BUILD SUCCESSFUL ==="
