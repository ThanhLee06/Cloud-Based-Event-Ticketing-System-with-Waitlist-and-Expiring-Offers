FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.18.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma/ ./prisma/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run prisma:generate && pnpm run build

ENV NODE_ENV=production
EXPOSE 4000
USER node
CMD ["node", "dist/main.js"]
