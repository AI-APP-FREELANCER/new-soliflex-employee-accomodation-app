#!/bin/bash
# Script to kill processes using port 3000 on Linux/Ubuntu VM

echo "Checking for processes using port 3000..."

# Find processes using port 3000
PIDS=$(lsof -ti:3000)

if [ -z "$PIDS" ]; then
    echo "No processes found using port 3000."
    exit 0
fi

echo "Found processes using port 3000: $PIDS"

# Kill each process
for PID in $PIDS; do
    echo "Killing process: $PID"
    kill -9 $PID 2>/dev/null
done

# Wait a moment and verify
sleep 1
REMAINING=$(lsof -ti:3000)

if [ -z "$REMAINING" ]; then
    echo "Port 3000 is now free!"
else
    echo "Warning: Some processes may still be using port 3000: $REMAINING"
fi

