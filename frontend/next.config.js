const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Tsconfig.json'daki alias ayarlarını webpack'e de ekleyelim:
    config.resolve.alias["@/components"] = path.join(__dirname, "src/app/components");
    config.resolve.alias["@/lib"] = path.join(__dirname, "src/lib");
    return config;
  },
};

module.exports = nextConfig;
