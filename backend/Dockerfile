FROM node:22-slim AS base

WORKDIR /app

# Chỉ copy manifest trước để tận dụng cache layer khi cài dependency
COPY package*.json ./
RUN npm ci --omit=dev

ARG BUILD_SHA=dev
ARG LP_APEX_FIXED_IP
ARG LP_CNAME_TARGET
ARG TELEGRAM_GATEWAY_SECRET
ARG TELEGRAM_API_ID
ARG TELEGRAM_API_HASH
ARG TELEGRAM_GATEWAY_TRANSPORT
ARG TELEGRAM_CONNECT_TIMEOUT_MS
RUN echo "Build SHA: $BUILD_SHA"

ENV BUILD_SHA=${BUILD_SHA}
LABEL org.opencontainers.image.revision=${BUILD_SHA}
ENV LP_APEX_FIXED_IP=${LP_APEX_FIXED_IP}
ENV LP_CNAME_TARGET=${LP_CNAME_TARGET}
ENV TELEGRAM_GATEWAY_SECRET=${TELEGRAM_GATEWAY_SECRET}
ENV TELEGRAM_API_ID=${TELEGRAM_API_ID}
ENV TELEGRAM_API_HASH=${TELEGRAM_API_HASH}
ENV TELEGRAM_GATEWAY_TRANSPORT=${TELEGRAM_GATEWAY_TRANSPORT}
ENV TELEGRAM_CONNECT_TIMEOUT_MS=${TELEGRAM_CONNECT_TIMEOUT_MS}

# Copy toàn bộ source với quyền sở hữu của user node
COPY --chown=node:node . .

ENV NODE_ENV=production

# Đảm bảo locale UTF-8 để Postgres / pg driver parse được SQL có ký tự
# multi-byte (em-dash, ký tự tiếng Việt có dấu) mà không lỗi "invalid byte
# sequence" hoặc "syntax error" khi migration runner chạy trên production.
ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# Tạo thư mục cho upload và cấp quyền ghi cho user node (tránh chown -R toàn bộ /app để tối ưu build layer).
# Cũng tạo `.telegram-sessions/` (directory, không phải file) để mtcute SqliteStorage
# mở `<dir>/client.session` qua better-sqlite3 — better-sqlite3 yêu cầu dir CHA tồn tại
# (nếu pass chính path là dir thì throw "unable to open database file"; nếu pass path là
# file mà không tồn tại + parent dir không writable cũng throw tương tự). Tách riêng khỏi
# `uploads/` để operator có thể mount volume persistent riêng (giống whatsapp-sessions).
RUN mkdir -p temp_uploads uploads .telegram-sessions && chown -R node:node temp_uploads uploads .telegram-sessions

# Chạy bằng user không phải root để tăng an toàn khi deploy VPS
USER node

EXPOSE 5001

CMD ["npm", "run", "start"]
