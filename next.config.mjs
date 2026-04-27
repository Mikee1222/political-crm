/** @type {import('next').NextConfig} */
/*
 * CRM session + portal blocking: root `middleware.ts` (`export const config.matcher`) runs on all non-static routes.
 *
 * frame-src: TikTok embed iframes (https://www.tiktok.com/embed/v2/{id}) and Facebook.
 * frame-ancestors: who may embed *this* site; keeps clickjacking protection.
 */
const csp = [
  "img-src 'self' data: blob: http: https: https://www.tiktok.com https://*.tiktok.com https://*.tiktokcdn.com https://*.muscdn.com https://www.facebook.com https://*.fbcdn.net https://*.cdninstagram.com https://scontent*.fbcdn.net",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://www.tiktok.com",
  "connect-src 'self' https: http:",
  "frame-src 'self' https://www.facebook.com https://facebook.com https://*.facebook.com https://www.tiktok.com https://tiktok.com https://m.tiktok.com https://*.tiktok.com",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.karagkounis.gr",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
