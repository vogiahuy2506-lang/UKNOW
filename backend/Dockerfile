FROM node:20-slim AS base

WORKDIR /app

# Chỉ copy manifest trước để tận dụng cache layer khi cài dependency
COPY package*.json ./
RUN npm ci --omit=dev

ARG BUILD_SHA=dev
ARG LP_APEX_FIXED_IP
ARG LP_CNAME_TARGET
RUN echo "Build SHA: $BUILD_SHA"

ENV LP_APEX_FIXED_IP=${LP_APEX_FIXED_IP}
ENV LP_CNAME_TARGET=${LP_CNAME_TARGET}

# Copy toàn bộ source với quyền sở hữu của user node
COPY --chown=node:node . .

ENV NODE_ENV=production

# Tạo thư mục cho upload và cấp quyền ghi cho user node (tránh chown -R toàn bộ /app để tối ưu build layer)
RUN mkdir -p temp_uploads uploads && chown -R node:node temp_uploads uploads

# Chạy bằng user không phải root để tăng an toàn khi deploy VPS
USER node

EXPOSE 5001

CMD ["npm", "run", "start"]
