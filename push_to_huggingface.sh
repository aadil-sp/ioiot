#!/bin/bash
# ============================================================
# push_to_huggingface.sh
# Run this script to push backend changes to HuggingFace Spaces
# Usage: ./push_to_huggingface.sh <YOUR_HF_TOKEN>
# Get your token at: https://huggingface.co/settings/tokens
# (Make sure it has "Write" permissions)
# ============================================================

HF_TOKEN=$1
HF_SPACE="aadilsp/ioiot-backend"
BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)/backend"

if [ -z "$HF_TOKEN" ]; then
    echo "❌ Error: Missing HuggingFace token"
    echo "Usage: ./push_to_huggingface.sh hf_xxxxxxxxx..."
    echo "Get token at: https://huggingface.co/settings/tokens"
    exit 1
fi

echo "🚀 Starting push to HuggingFace Space: $HF_SPACE"
echo "📁 Backend source: $BACKEND_DIR"

# Create temp directory
TEMP_DIR=$(mktemp -d)
echo "📂 Using temp dir: $TEMP_DIR"

# Clone the HuggingFace Space
echo "⬇️  Cloning HuggingFace Space..."
git clone "https://aadilsp:$HF_TOKEN@huggingface.co/spaces/$HF_SPACE" "$TEMP_DIR/hf-space" 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Failed to clone HuggingFace Space. Check your token."
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "✅ Cloned successfully!"

# Copy updated backend files
echo "📋 Copying updated backend files..."
cp "$BACKEND_DIR/index.js" "$TEMP_DIR/hf-space/index.js"
cp -r "$BACKEND_DIR/models/" "$TEMP_DIR/hf-space/models/"
cp -r "$BACKEND_DIR/middleware/" "$TEMP_DIR/hf-space/middleware/"
cp "$BACKEND_DIR/package.json" "$TEMP_DIR/hf-space/package.json"
cp "$BACKEND_DIR/package-lock.json" "$TEMP_DIR/hf-space/package-lock.json"
cp "$BACKEND_DIR/Dockerfile" "$TEMP_DIR/hf-space/Dockerfile"
cp "$BACKEND_DIR/.dockerignore" "$TEMP_DIR/hf-space/.dockerignore"

echo "✅ Files copied!"

# Push to HuggingFace
cd "$TEMP_DIR/hf-space"
git config user.email "aadilsp@gmail.com"
git config user.name "aadilsp"

git add -A

# Check if there are actual changes
if git diff --cached --quiet; then
    echo "ℹ️  No changes detected — HuggingFace already has the latest code"
    rm -rf "$TEMP_DIR"
    exit 0
fi

echo "📤 Pushing to HuggingFace..."
git commit -m "Update backend: fix live toggle, arduino board creation, USB device support"
git push

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to HuggingFace!"
    echo "🔨 Docker build will start automatically (takes 5-15 mins for first build)"
    echo "🌐 Monitor build at: https://huggingface.co/spaces/$HF_SPACE"
else
    echo "❌ Push failed. Check your token permissions."
fi

# Cleanup
rm -rf "$TEMP_DIR"
echo "🧹 Cleanup done"
