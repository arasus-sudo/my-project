import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set (no insecure default is provided)");
}

const JWT_ALG = "HS256";
const JWT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days, matches current Python backend

export interface TokenPayload {
  uid: string;
  exp: number;
}

export function makeToken(userId: string): string {
  const payload: TokenPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS,
  };
  return jwt.sign(payload, JWT_SECRET as string, { algorithm: JWT_ALG });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET as string, { algorithms: [JWT_ALG] }) as TokenPayload;
}
