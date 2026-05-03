import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";

export interface JwtPayload {
  userId: string;
  // Version of the user's session at issue time. The server bumps the
  // user's tokenVersion column to invalidate every previously-issued JWT
  // (admin "force logout"). Optional for backward compatibility with
  // tokens minted before this field existed — those are treated as v0.
  tokenVersion?: number;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { iat: number; exp: number };
    return { userId: decoded.userId, tokenVersion: decoded.tokenVersion };
  } catch {
    return null;
  }
}
