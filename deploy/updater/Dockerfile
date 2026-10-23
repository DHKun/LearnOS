# Small updater image: Node + Docker CLI + Compose plugin.
# It has no HTTP listener; its only inputs are Supabase jobs and the mounted
# project. All commands are hard-coded in updater.mjs.
FROM node:22-alpine

RUN apk add --no-cache docker-cli docker-cli-compose tini \
  && docker --version \
  && docker compose version

WORKDIR /app
COPY updater.mjs ./

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/updater.mjs"]
