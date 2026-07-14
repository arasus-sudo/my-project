import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword } from "../lib/password";
import { makeToken } from "../lib/jwt";
import { requireAuth } from "../lib/auth";

interface SignupBody {
  name: string;
  email: string;
  password: string;
  workspace_name: string;
}

interface LoginBody {
  email: string;
  password: string;
}

function userOut(user: { id: string; email: string; name: string }) {
  return { id: user.id, email: user.email, name: user.name };
}

function workspaceOut(ws: { id: string; name: string }) {
  return { id: ws.id, name: ws.name };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: SignupBody }>("/auth/signup", async (req, reply) => {
    const { name, email, password, workspace_name } = req.body;
    const normalizedEmail = email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return reply.code(400).send({ detail: "Email already registered" });
    }

    const passwordHash = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: workspace_name,
          ownerId: "", // set below once user id is known
          brandVoice: { tone: "", banned_phrases: [], sample: "" },
          plan: "trial",
        },
      });
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          passwordHash,
          workspaceId: workspace.id,
          role: "org_admin",
        },
      });
      const updatedWorkspace = await tx.workspace.update({
        where: { id: workspace.id },
        data: { ownerId: user.id },
      });
      return { user, workspace: updatedWorkspace };
    });

    const token = makeToken(result.user.id);
    return {
      token,
      user: userOut(result.user),
      workspace: workspaceOut(result.workspace),
    };
  });

  app.post<{ Body: LoginBody }>("/auth/login", async (req, reply) => {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ detail: "Invalid email or password" });
    }
    const workspace = await prisma.workspace.findUnique({ where: { id: user.workspaceId } });
    if (!workspace) {
      return reply.code(401).send({ detail: "Invalid email or password" });
    }
    if (user.blocked || workspace.blocked) {
      return reply.code(403).send({ detail: "Account suspended" });
    }

    const token = makeToken(user.id);
    return {
      token,
      user: userOut(user),
      workspace: workspaceOut(workspace),
      is_admin: false,
    };
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (req) => {
    return {
      user: userOut(req.currentUser!),
      workspace: workspaceOut(req.currentWorkspace!),
    };
  });
}
