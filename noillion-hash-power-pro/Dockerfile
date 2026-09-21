FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY src ./src

USER node
EXPOSE 5557 5558
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5558/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "src/server.ts"]
