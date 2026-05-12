import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  serverExternalPackages: ["pdfkit", "xlsx"],
};

export default nextConfig;
