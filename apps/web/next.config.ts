import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@chaos-swarm/agent-core", "@chaos-swarm/reporting"],
};

export default nextConfig;
