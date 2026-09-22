FROM node:24-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/NoillioN-Labs/umbrel-community-app-store"
LABEL org.opencontainers.image.description="Hash Power Pro Umbrel Stratum routing gateway"
LABEL org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src

RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 5557 5558
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5558/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
