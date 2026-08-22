import type { AuthContext } from "@rfp-os/types";

declare global {
  namespace Express {
    interface Request {
      id: string;
      /**
       * Populated by AuthGuard. Present on every authenticated, org-scoped
       * request; absent on @Public routes and on @AllowWithoutOrg routes where
       * the caller has no membership yet.
       */
      auth?: AuthContext;
      /** Set whenever a session resolved, even without an organization. */
      sessionUserId?: string;
      sessionId?: string;
    }
  }
}

export {};
