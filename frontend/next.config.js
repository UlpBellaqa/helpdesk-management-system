import path from 'node:path'

const nextConfig = {
  turbopack: {
    root: path.resolve(process.cwd()),
  },
}

export default nextConfig
