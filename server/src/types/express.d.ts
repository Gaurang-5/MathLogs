import { Express } from "express";

declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        instituteId: string;
        username: string;
        role: string;
        [key: string]: any;
      };
      correlationId: string;
      superAdminChallengeId?: string;
    }
  }
}
