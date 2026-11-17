"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  clearAuthSession,
  createWorkspace,
  fetchBootstrapStatus,
  fetchCurrentUser,
  loginUser,
  logoutUser,
  refreshAuthToken,
  registerUser,
  setAuthSession,
  setOnUnauthorizedCallback,
} from "@/lib/api";
import { AuthTokenResponse, UserSummary, WorkspaceSummary } from "@/types/auth";

interface AuthContextValue {
  user: UserSummary | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceSummary | null;
  activeRole: string | null;
  permissions: string[];
  isLoading: boolean;
  needsSetup: boolean;
  authMode: string;
  allowPublicSignup: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (params: {
    email: string;
    password: string;
    fullName?: string;
    workspaceName?: string;
    invitationToken?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  createNewWorkspace: (name: string, planTier?: string) => Promise<WorkspaceSummary>;
  refreshProfile: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authMode, setAuthMode] = useState("local");
  const [allowPublicSignup, setAllowPublicSignup] = useState(true);

  const resetLocalState = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setActiveRole(null);
    setPermissions([]);
  }, []);

  const syncFromMe = useCallback(async () => {
    const me = await fetchCurrentUser();
    setUser(me.user);
    setWorkspaces(me.workspaces);
    setActiveWorkspaceId(me.active_workspace_id);
    setActiveRole(me.active_role);
    setPermissions(me.permissions);
  }, []);

  const applyTokenResponse = useCallback(
    async (data: AuthTokenResponse) => {
      setAuthSession(data.access_token, data.active_workspace_id);
      setUser(data.user);
      setWorkspaces(data.workspaces);
      setActiveWorkspaceId(data.active_workspace_id);
      setNeedsSetup(false);
      await syncFromMe();
    },
    [syncFromMe],
  );

  useEffect(() => {
    setOnUnauthorizedCallback(() => {
      resetLocalState();
    });
    return () => setOnUnauthorizedCallback(null);
  }, [resetLocalState]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await fetchBootstrapStatus();
        if (!active) return;
        setNeedsSetup(status.needs_setup);
        setAuthMode(status.auth_mode || "local");
        setAllowPublicSignup(status.allow_public_signup);

        if (!status.needs_setup) {
          try {
            const refreshed = await refreshAuthToken();
            if (!active) return;
            await applyTokenResponse(refreshed);
          } catch {
            // No active HttpOnly refresh cookie yet
          }
        }
      } catch {
        // Backend offline or unreachable
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyTokenResponse]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await loginUser(email, password);
      await applyTokenResponse(data);
    },
    [applyTokenResponse],
  );

  const register = useCallback(
    async (params: {
      email: string;
      password: string;
      fullName?: string;
      workspaceName?: string;
      invitationToken?: string;
    }) => {
      const data = await registerUser(params);
      await applyTokenResponse(data);
    },
    [applyTokenResponse],
  );

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      resetLocalState();
    }
  }, [resetLocalState]);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const refreshed = await refreshAuthToken();
      setAuthSession(refreshed.access_token, workspaceId);
      await syncFromMe();
    },
    [syncFromMe],
  );

  const createNewWorkspace = useCallback(
    async (name: string, planTier = "team"): Promise<WorkspaceSummary> => {
      const ws = await createWorkspace(name, planTier);
      await switchWorkspace(ws.id);
      return ws;
    },
    [switchWorkspace],
  );

  const hasPermission = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions],
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        workspaces,
        activeWorkspaceId,
        activeWorkspace,
        activeRole,
        permissions,
        isLoading,
        needsSetup,
        authMode,
        allowPublicSignup,
        login,
        register,
        logout,
        switchWorkspace,
        createNewWorkspace,
        refreshProfile: syncFromMe,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
