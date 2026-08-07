# syntax=docker/dockerfile:1

# ---- Stage 1: dependencies -------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: build --------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` runs pages to collect metadata. Every page that touches the
# database is force-dynamic, but the Prisma client still has to exist at build
# time for the imports to typecheck and bundle.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ---- Stage 3: runtime ------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The Prisma CLI applies migrations at container start, and tsx runs the seed
# script. Installing them here rather than copying them out of the deps stage
# lets npm resolve their transitive graphs correctly; the two heaviest Prisma
# packages are only used by `prisma studio` and `prisma dev`, neither of which
# runs in production.
#
# @prisma/adapter-pg is listed explicitly because Next inlines it into the
# server bundle rather than leaving it in the traced node_modules — so the
# standalone server has it, but the seed script would not.
RUN npm install --no-save --omit=optional \
        prisma@7.9.1 @prisma/adapter-pg@7.9.1 dotenv@17.4.2 tsx@4.23.11 \
    && rm -rf node_modules/@prisma/studio-core node_modules/@prisma/dev \
    && npm cache clean --force

# Migration and seed inputs. The seed imports the generated client directly, so
# it comes along too — the standalone server has its own copy bundled already.
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/generated ./generated

# The standalone build already contains a minimal node_modules with everything
# the server needs, so the application itself brings no extra install step.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && addgroup -g 1001 -S nodejs \
    && adduser -u 1001 -S nextjs -G nodejs \
    && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
