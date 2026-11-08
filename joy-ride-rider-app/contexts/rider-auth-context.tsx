import {
  RiderAuthenticationError,
  RiderRegistration,
  loginRider,
  logoutRider,
  registerRider,
} from "@/services/rider-auth";
import {
  RiderSession,
  clearRiderSession,
  loadRiderSession,
  subscribeToRiderSession,
} from "@/services/rider-session";
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type RiderAuthContextValue = {
  session: RiderSession | null;
  isLoading: boolean;
  signIn: (phone: string, password: string) => Promise<void>;
  register: (registration: RiderRegistration) => Promise<void>;
  signOut: () => Promise<void>;
};

const RiderAuthContext = createContext<RiderAuthContextValue | null>(null);

export function RiderAuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<RiderSession | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = subscribeToRiderSession((nextSession) => {
      if (isMounted) {
        setSession(nextSession);
      }
    });

    void loadRiderSession()
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
      void clearRiderSession();
      return;
    }

    const timer = setTimeout(() => {
      void clearRiderSession();
    }, remainingMilliseconds);

    return () => {
      clearTimeout(timer);
    };
  }, [session]);

  const signIn = useCallback(
    async (phone: string, password: string): Promise<void> => {
      await loginRider(phone, password);
    },
    [],
  );

  const register = useCallback(
    async (registration: RiderRegistration): Promise<void> => {
      await registerRider(registration);
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await logoutRider();
  }, []);

  const value = useMemo<RiderAuthContextValue>(
    () => ({
      session,
      isLoading,
      signIn,
      register,
      signOut,
    }),
    [isLoading, register, session, signIn, signOut],
  );

  return (
    <RiderAuthContext.Provider value={value}>
      {children}
    </RiderAuthContext.Provider>
  );
}

export function useRiderAuth(): RiderAuthContextValue {
  const context = useContext(RiderAuthContext);

  if (!context) {
    throw new RiderAuthenticationError(
      "Rider authentication is unavailable.",
      500,
    );
  }

  return context;
}
