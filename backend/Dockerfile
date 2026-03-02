# Use official Node.js image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy local code to the container
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7860

# Expose the port (Hugging Face Spaces default is 7860)
EXPOSE 7860

# Start the server
CMD ["node", "index.js"]
