FROM node:22-bookworm-slim AS ui
WORKDIR /build
COPY web/package*.json ./web/
RUN npm --prefix web ci
COPY web ./web
RUN npm --prefix web run build

FROM node:22-bookworm-slim
# LibreOffice backs the /api PDF preview endpoints; sharp needs no extra packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
COPY --from=ui /build/web/dist ./web/dist
ENV HOST=0.0.0.0 PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
