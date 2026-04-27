/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "frame-src 'self'",
              "https://www.facebook.com",
              "https://facebook.com",
              "https://*.facebook.com",
              "https://www.tiktok.com",
              "https://tiktok.com",
              "https://*.tiktok.com",
              "data:",
              "blob:",
            ].join(" "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
