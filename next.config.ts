import type { NextConfig } from "next";

/**
 * How many worker processes collect page data during a build.
 *
 * Each worker is a second copy of the app in memory, which is the difference
 * between a build that finishes on a small server and one the kernel kills
 * halfway through. Unset means "as many as there are cores", which is right on
 * a development machine and wrong on a 2GB VPS; the Dockerfile pins it to 1.
 */
const buildWorkers = Number.parseInt(process.env.NEXT_BUILD_WORKERS ?? "", 10);

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle in .next/standalone, which keeps the
  // production image small and means the runtime stage needs no node_modules.
  output: "standalone",
  ...(Number.isInteger(buildWorkers) && buildWorkers > 0
    ? { experimental: { cpus: buildWorkers } }
    : {}),
};

export default nextConfig;
