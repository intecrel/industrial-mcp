/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: true,
  experimental: {
    largePageDataBytes: 128 * 100000, // Adjust if needed
  }
}

module.exports = nextConfig