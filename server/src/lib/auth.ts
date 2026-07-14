import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "./prisma";
import { verifyToken } from "./jwt";
import type { User, Workspace } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: User;
    currentWorkspace?: Workspace;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.code(401).send({ detail: "Not authenticated" });
  }
  const token = header.slice("Bearer ".length);

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return reply.code(401).send({ detail: "Invalid or expired token" });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user) {
    return reply.code(401).send({ detail: "User not found" });
  }
  // workspace_id is re-derived from the user's current DB row on every request,
  // not trusted from the JWT claim (unlike the Python backend this replaces).
  const workspace = await prisma.workspace.findUnique({ where: { id: user.workspaceId } });
  if (!workspace) {
    return reply.code(401).send({ detail: "Workspace not found" });
  }
  // blocked status is checked on every request, not just at login.
  if (user.blocked || workspace.blocked) {
    return reply.code(403).send({ detail: "Account suspended" });
  }

  req.currentUser = user;
  req.currentWorkspace = workspace;
}
