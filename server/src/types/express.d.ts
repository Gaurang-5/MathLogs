import { Express } from "express";

declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        instituteId: string;
        username: string;
        [key: string]: any;
      };
    }
  }
}
