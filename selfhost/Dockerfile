FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
WORKDIR /app/selfhost
COPY selfhost/package.json selfhost/package-lock.json ./
RUN npm ci --include=dev
COPY src /app/src
RUN npm run build

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
ARG WITH_POSTGRES=false
WORKDIR /app/selfhost
COPY selfhost/package.json selfhost/package-lock.json ./
RUN if [ "$WITH_POSTGRES" = true ]; then npm ci --omit=dev; else npm ci --omit=dev --omit=optional; fi
COPY --from=build /app/selfhost/dist ./dist
COPY selfhost/scripts ./scripts
RUN mkdir -p /data && chown node:node /data && chmod +x scripts/*
USER node
EXPOSE 8080
ENTRYPOINT ["./scripts/entrypoint.sh"]
CMD ["start"]
