FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

ARG BUILD_SHA=dev
RUN echo "Build SHA: $BUILD_SHA"

COPY . .

# Cho phép truyền biến API URL và Google Client ID lúc build
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}

ARG VITE_PRIMARY_APP_HOSTS=localhost,127.0.0.1,founderai.biz,www.founderai.biz
ENV VITE_PRIMARY_APP_HOSTS=${VITE_PRIMARY_APP_HOSTS}

ARG VITE_DEFAULT_FROM_DOMAIN=digiso.vn
ENV VITE_DEFAULT_FROM_DOMAIN=${VITE_DEFAULT_FROM_DOMAIN}

# Để trống = không nạp Google Analytics (build dev/preview).
ARG VITE_GA_MEASUREMENT_ID
ENV VITE_GA_MEASUREMENT_ID=${VITE_GA_MEASUREMENT_ID}

# Cờ tính năng — chỉ chuỗi 'true' mới mở route. Không khai ARG thì
# --build-arg bị Docker bỏ qua và cờ luôn đóng dù workflow có truyền.
ARG VITE_FEATURE_ORDERS=false
ENV VITE_FEATURE_ORDERS=${VITE_FEATURE_ORDERS}

ARG VITE_FEATURE_COURSES=false
ENV VITE_FEATURE_COURSES=${VITE_FEATURE_COURSES}

ARG VITE_FEATURE_PRODUCTS=false
ENV VITE_FEATURE_PRODUCTS=${VITE_FEATURE_PRODUCTS}

ARG VITE_FEATURE_LANDING_CMS=false
ENV VITE_FEATURE_LANDING_CMS=${VITE_FEATURE_LANDING_CMS}

RUN npm run build
RUN printf '{"sha":"%s"}\n' "$BUILD_SHA" > /app/dist/version.json

FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
