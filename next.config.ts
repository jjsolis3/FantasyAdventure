import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle in .next/standalone, which keeps the
  // production image small and means the runtime stage needs no node_modules.
  output: "standalone",
};

export default nextConfig;
