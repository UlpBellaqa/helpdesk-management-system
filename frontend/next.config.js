import path from 'node:path'

const nextConfig = {
  devIndicators: false,
  turbopack: {
    root: path.resolve(process.cwd()),
  },
}

export default nextConfig
