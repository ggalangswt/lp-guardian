FROM node:22-slim

WORKDIR /app

# Install deps first for layer caching. Retry to tolerate flaky build-time
# networking (e.g. right after the Docker engine boots).
COPY package.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV PORT=8090
EXPOSE 8090

CMD ["node", "src/index.mjs"]
