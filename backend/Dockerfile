# ─── Stage 1: Node.js + Arduino CLI + ESP32 Core ────────────────────────────
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    python3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install arduino-cli (single static binary)
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh

# Configure arduino-cli and install ESP32 core + required libraries
# This is the slow part (~5-15 min) but only runs once during Docker build
RUN arduino-cli config init && \
    arduino-cli config add board_manager.additional_urls \
    "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json" && \
    arduino-cli core update-index && \
    (for i in 1 2 3 4 5; do arduino-cli core install esp32:esp32 && break || sleep 15; done) && \
    (for i in 1 2 3 4 5; do arduino-cli lib install "ArduinoJson" && break || sleep 15; done) && \
    (for i in 1 2 3 4 5; do arduino-cli lib install "ESP32Servo" && break || sleep 15; done) && \
    (for i in 1 2 3 4 5; do arduino-cli lib install "PubSubClient" && break || sleep 15; done) && \
    echo "Arduino CLI setup complete"

# Save boot_app0.bin path so the compile endpoint can find it at runtime
RUN find /root -name "boot_app0.bin" 2>/dev/null | head -1 > /boot_app0_path.txt && \
    echo "boot_app0.bin path: $(cat /boot_app0_path.txt)"

# ─── Node.js App ─────────────────────────────────────────────────────────────
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860
CMD ["node", "index.js"]
