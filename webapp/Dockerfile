# ---- build stage ----
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S app && adduser -S app -G app

# db/app-init.sql is read at startup by server/init-db.ts
COPY --from=builder /app/db ./db
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER app
EXPOSE 3000
CMD ["node", "server.js"]
