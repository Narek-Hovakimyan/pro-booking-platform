import helmet from "helmet";

const permissionsPolicy = "camera=(), microphone=(), geolocation=()";

export const createSecurityHeadersMiddleware = ({ isProduction }) => {
  const helmetMiddleware = helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-origin" },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: isProduction
      ? {
          maxAge: 31_536_000,
          includeSubDomains: true,
          preload: false,
        }
      : false,
  });

  return (req, res, next) => {
    helmetMiddleware(req, res, (error) => {
      if (error) {
        next(error);
        return;
      }

      res.setHeader("Permissions-Policy", permissionsPolicy);
      next();
    });
  };
};

export const publicMediaResourcePolicy = helmet.crossOriginResourcePolicy({
  policy: "cross-origin",
});
