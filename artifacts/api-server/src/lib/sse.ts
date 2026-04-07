import type { Response } from "express";

interface SSEClient {
  userId: number;
  role: string;
  res: Response;
}

const clients = new Map<number, SSEClient>();

export function addSSEClient(userId: number, role: string, res: Response): void {
  clients.set(userId, { userId, role, res });
}

export function removeSSEClient(userId: number): void {
  clients.delete(userId);
}

export function broadcastToRoles(roles: string[], event: string, data: object): void {
  clients.forEach((client) => {
    if (roles.includes(client.role)) {
      try {
        client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        clients.delete(client.userId);
      }
    }
  });
}

export function sendToUser(userId: number, event: string, data: object): void {
  const client = clients.get(userId);
  if (!client) return;
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(userId);
  }
}

export function getConnectedCount(): number {
  return clients.size;
}
