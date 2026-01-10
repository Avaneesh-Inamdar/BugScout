FROM node:18-slim

WORKDIR /app

# Copy package files first
COPY package*.json ./
RUN npm install

# Install Playwright with ALL system dependencies (the --with-deps flag handles everything)
RUN npx playwright install --with-deps chromium

# Copy backend code
COPY backend ./backend

# Create screenshots directory
RUN mkdir -p screenshots

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "backend/server.js"]
