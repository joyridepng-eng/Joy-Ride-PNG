import {
  DriverAuthenticationError,
  loginDriver,
  logoutDriver,
} from "@/services/driver-auth";
import {
  DriverSession,
  clearDriverSession,
  loadDriverSession,
  subscribeToDriverSession,
} from "@/services/driver-session";
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type DriverAuthContextValue = {
  session: DriverSession | null;
  isLoading: boolean;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const DriverAuthContext = createContext<DriverAuthContextValue | null>(null);

export function DriverAuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<DriverSession | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = subscribeToDriverSession((nextSession) => {
      if (isMounted) {
        setSession(nextSession);
      }
    });

    void loadDriverSession()
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
      void clearDriverSession();
      return;
    }

    const timer = setTimeout(() => {
      void clearDriverSession();
    }, remainingMilliseconds);

    return () => {
      clearTimeout(timer);
    };
  }, [session]);

  const signIn = useCallback(
    async (phone: string, password: string): Promise<void> => {
      await loginDriver(phone, password);
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await logoutDriver();
  }, []);

  const value = useMemo<DriverAuthContextValue>(
    () => ({
      session,
      isLoading,
      signIn,
      signOut,
    }),
    [isLoading, session, signIn, signOut],
  );

  return (
    <DriverAuthContext.Provider value={value}>
      {children}
    </DriverAuthContext.Provider>
  );
}

export function useDriverAuth(): DriverAuthContextValue {
  const context = useContext(DriverAuthContext);

  if (!context) {
    throw new DriverAuthenticationError(
      "Driver authentication is unavailable.",
      500,
    );
  }

  return context;
}
