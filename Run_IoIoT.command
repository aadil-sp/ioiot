#!/bin/bash

# Load Environment paths to ensure Node and NPM are available when double-clicked
export PATH=$PATH:/usr/local/bin:/opt/homebrew/bin
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  \. "$HOME/.nvm/nvm.sh"
fi

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# To ensure the processes die when the terminal is closed
trap 'kill $(jobs -p)' EXIT SIGINT SIGTERM

echo "========================================="
echo "        Starting IoIoT Platform...       "
echo "========================================="

echo "=> 1/2 Starting Backend..."
cd "$DIR/backend"
# Start backend in the background
node index.js &

echo "=> 2/2 Starting Frontend..."
cd "$DIR/frontend"
# Start frontend in the background and open the browser
npm run dev -- --open &

echo ""
echo "========================================="
echo "      IoIoT Platform is running!         "
echo " Backend is running on: http://localhost:5001"
echo " Frontend is running on: http://localhost:5173"
echo "========================================="
echo ""
echo "!!! IMPORTANT: CLOSE THIS TERMINAL WINDOW TO STOP BOTH SERVERS !!!"
echo ""

# Wait for background jobs so the script doesn't exit immediately and the trap can work
wait
