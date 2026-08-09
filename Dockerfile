# syntax=docker/dockerfile:1

# ---- Stage 1: dependencies -------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# @playwright/test is a devDependency used by the end-to-end tests. Its
# postinstall would otherwise pull ~400MB of browsers into a layer that never
# runs them.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# ---- Stage 2: build --------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` runs pages to collect metadata. Every page that touches the
# database is force-dynamic, but the Prisma client still has to exist at build
# time for the imports to typecheck and bundle. No DATABASE_URL is needed —
# lib/db.ts connects on first use, not on import.
ENV NEXT_TELEMETRY_DISABLED=1

# Build memory, which is the usual reason a deployment fails on a small server.
#
# A build that runs out of memory does not report an error: the kernel kills the
# compiler, the step ends mid-sentence — typically right after "Creating an
# optimized production build ..." — and the deployment fails with exit code 255
# and nothing to read. Both knobs below buy headroom at the cost of build time.
#
#   NEXT_BUILD_WORKERS   page-data collection workers; each is another copy of
#                        the app in memory. 1 is slower and much lighter.
#   NEXT_BUILD_MEMORY_MB cap on the JavaScript heap, so Node collects garbage
#                        instead of growing until the kernel intervenes.
#
# If it still gets killed, build with webpack instead: Turbopack is faster but
# holds far more in memory. In Coolify: Configuration → Build → Build Arguments,
# NEXT_BUILD_BUNDLER=webpack.
ARG NEXT_BUILD_WORKERS=1
ARG NEXT_BUILD_MEMORY_MB=1536
ARG NEXT_BUILD_BUNDLER=turbopack
ENV NEXT_BUILD_WORKERS=${NEXT_BUILD_WORKERS} \
    NODE_OPTIONS=--max-old-space-size=${NEXT_BUILD_MEMORY_MB}

RUN set -e; \
    echo "Building with ${NEXT_BUILD_BUNDLER}, ${NEXT_BUILD_WORKERS} worker(s), ${NEXT_BUILD_MEMORY_MB}MB heap."; \
    free -m || true; \
    npx prisma generate; \
    if [ "${NEXT_BUILD_BUNDLER}" = "webpack" ]; then \
      set -- --webpack; \
    else \
      set -- --turbopack; \
    fi; \
    if ! npx next build "$@"; then \
      echo "" >&2; \
      echo "The build failed. If it stopped without printing an error of its own," >&2; \
      echo "the server ran out of memory — see the Troubleshooting section of the" >&2; \
      echo "README for the two settings that fix it." >&2; \
      exit 1; \
    fi

# ---- Stage 3: runtime ------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The Prisma CLI applies migrations at container start, and tsx runs the seed
# script. Installing them here rather than copying them out of the deps stage
# lets npm resolve their transitive graphs correctly.
#
# Do NOT prune @prisma/studio-core or @prisma/dev to slim this layer. They look
# like development-only packages, but prisma/build/cli.js requires studio-core
# eagerly at module load, so removing it breaks `migrate deploy` itself with a
# MODULE_NOT_FOUND that never reaches the database.
#
# @prisma/client and @prisma/adapter-pg are listed explicitly rather than relied
# on from the standalone bundle: Next inlines the adapter into the server bundle
# and only traces what the server imports, so the seed script — which runs under
# tsx, outside that bundle — has to resolve them from here.
RUN npm install --no-save --omit=optional \
        prisma@7.9.1 @prisma/client@7.9.1 @prisma/adapter-pg@7.9.1 \
        dotenv@17.4.2 tsx@4.23.11 \
    && npm cache clean --force

# Migration and seed inputs. The seed imports the generated client directly, so
# it comes along too — the standalone server has its own copy bundled already.
# lib/ is here because the seed reaches into lib/auth/invite-code.ts; that
# module is deliberately import-free so it resolves by relative path, since the
# `@/` tsconfig alias does not exist in this stage.
COPY prisma ./prisma
COPY lib ./lib
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

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
