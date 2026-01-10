FROM node:18-slim

# Cache bust: v3
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies - postinstall script will run playwright install --with-deps
RUN npm install

# Copy backend code
COPY . .

# Create screenshots directory
RUN mkdir -p screenshots

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "server.js"]
