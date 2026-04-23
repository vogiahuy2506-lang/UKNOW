FROM node:20-slim AS base

WORKDIR /app

# Chỉ copy manifest trước để tận dụng cache layer khi cài dependency
COPY package*.json ./
RUN npm ci --omit=dev

# Copy toàn bộ source sau khi đã cài dependency
COPY . .

ENV NODE_ENV=production

# Chạy bằng user không phải root để tăng an toàn khi deploy VPS
USER node

EXPOSE 5001

CMD ["npm", "run", "start"]
