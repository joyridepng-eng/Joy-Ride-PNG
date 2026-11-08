import {
  AdminAuthenticationError,
  loginAdmin,
  logoutAdmin,
} from "@/services/admin-auth";
import {
  AdminSession,
  clearAdminSession,
  loadAdminSession,
  subscribeToAdminSession,
} from "@/services/admin-session";
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type AdminAuthContextValue = {
  session: AdminSession | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AdminSession | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = subscribeToAdminSession((nextSession) => {
      if (isMounted) {
        setSession(nextSession);
      }
    });

    void loadAdminSession()
      .then((storedSession) => {
        if (isMounted) {
          setSession(storedSession);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    const remainingMilliseconds = session.expiresAt - Date.now();

    if (remainingMilliseconds <= 0) {
      void clearAdminSession();
      return;
    }

    const timer = setTimeout(() => {
      void clearAdminSession();
    }, remainingMilliseconds);

    return () => {
      clearTimeout(timer);
    };
  }, [session]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      await loginAdmin(email, password);
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await logoutAdmin();
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      session,
      isLoading,
      signIn,
      signOut,
    }),
    [isLoading, session, signIn, signOut],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new AdminAuthenticationError(
      "Administrator authentication is unavailable.",
      500,
    );
  }

  return context;
}
