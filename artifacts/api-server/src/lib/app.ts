import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "../routes";
import { logger } from "./logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = new Set<string>();
const replitDomain = process.env.REPLIT_DEV_DOMAIN;
if (replitDomain) {
  allowedOrigins.add(`https://${replitDomain}`);
  allowedOrigins.add(`https://${replitDomain}:3000`);
  allowedOrigins.add(`https://${replitDomain}:3001`);
}
const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN;
if (expoDomain) allowedOrigins.add(`https://${expoDomain}`);

const extra = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
for (const o of extra) allowedOrigins.add(o);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: false,
  }),
);
// 12mb is generous enough to accept base64-encoded avatar uploads
// (resized to ~512×512 on the client, but raw camera photos can be larger).
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

app.use("/api", router);

export default app;
