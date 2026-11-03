import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, devIndicators: false, serverExternalPackages: ['@prisma/client'] };
export default config;
