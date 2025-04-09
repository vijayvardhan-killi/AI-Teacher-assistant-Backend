# Use an official Node.js image with Debian base
FROM node:18-slim

# Install poppler-utils for PDF to image conversion
RUN apt-get update && \
    apt-get install -y graphicsmagick poppler-utils && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*


# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your app
COPY . .

# Expose port
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]
