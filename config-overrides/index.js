module.exports = function override(config) {
  const fallback = {
    fs: false,
    path: false,
    crypto: false,
  };

  config.resolve = config.resolve || {};
  config.resolve.fallback = {
    ...(config.resolve.fallback || {}),
    ...fallback,
  };

  return config;
};
