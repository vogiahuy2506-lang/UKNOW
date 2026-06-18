FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

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

ARG VITE_DEFAULT_FROM_DOMAIN=founderai.biz
ENV VITE_DEFAULT_FROM_DOMAIN=${VITE_DEFAULT_FROM_DOMAIN}

RUN yarn build
RUN printf '{"sha":"%s"}\n' "$BUILD_SHA" > /app/dist/version.json

FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
