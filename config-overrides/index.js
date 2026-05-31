const DEVTOOLS_STUB_PATH = "/.well-known/appspecific/com.chrome.devtools.json";
const DEVTOOLS_STUB_RESPONSE = JSON.stringify({
  workspace: {
    root: "/",
  },
});

function applyWebpackFallbacks(config) {
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
}

function withDevtoolsStub(configFunction) {
  return function overrideDevServer(proxy, allowedHost) {
    const config = configFunction(proxy, allowedHost);
    const existingSetupMiddlewares = config.setupMiddlewares;
    const existingOnBeforeSetupMiddleware = config.onBeforeSetupMiddleware;
    const existingOnAfterSetupMiddleware = config.onAfterSetupMiddleware;

    config.setupMiddlewares = function setupMiddlewares(middlewares, devServer) {
      let resolvedMiddlewares = middlewares;

      if (typeof existingSetupMiddlewares === "function") {
        resolvedMiddlewares =
          existingSetupMiddlewares(middlewares, devServer) || middlewares;
      } else {
        if (typeof existingOnBeforeSetupMiddleware === "function") {
          existingOnBeforeSetupMiddleware(devServer);
        }
        if (typeof existingOnAfterSetupMiddleware === "function") {
          existingOnAfterSetupMiddleware(devServer);
        }
      }

      resolvedMiddlewares.unshift({
        name: "chrome-devtools-stub",
        path: DEVTOOLS_STUB_PATH,
        middleware: function devtoolsStubMiddleware(req, res, next) {
          if (req.path === DEVTOOLS_STUB_PATH) {
            res.setHeader("Content-Type", "application/json");
            res.statusCode = 200;
            res.end(DEVTOOLS_STUB_RESPONSE);
            return;
          }
          next();
        },
      });

      return resolvedMiddlewares;
    };

    delete config.onBeforeSetupMiddleware;
    delete config.onAfterSetupMiddleware;

    return config;
  };
}

module.exports = {
  webpack: function override(config) {
    return applyWebpackFallbacks(config);
  },
  devServer: function overrideDevServer(configFunction) {
    return withDevtoolsStub(configFunction);
  },
};
