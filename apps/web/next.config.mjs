/** @type {import('next').NextConfig} */
const nextConfig = {
  // @feeforensics/shared ships raw TypeScript (exports ./src/index.ts), so Next
  // must transpile it rather than expect prebuilt JS.
  transpilePackages: ["@feeforensics/shared"],
  reactStrictMode: true,
};

export default nextConfig;
