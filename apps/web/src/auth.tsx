import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./lib/api";

type User = {
  sub: string;
  email: string;
  name: string;
  permissions: string[];
  roles: string[];
};
type AuthContextValue = {
  user: User | null;
  login(email: string, password: string): Promise<void>;
  logout(): void;
  can(permission: string): boolean;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = sessionStorage.getItem("servitechno_user");
    return raw ? JSON.parse(raw) : null;
  });
  useEffect(() => {
    const revoke = () => setUser(null);
    window.addEventListener("servitechno-unauthorized", revoke);
    return () => window.removeEventListener("servitechno-unauthorized", revoke);
  }, []);
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      async login(email, password) {
        const result = await api<{ accessToken: string; user: User }>(
          "/auth/login",
          { method: "POST", body: JSON.stringify({ email, password }) },
        );
        sessionStorage.setItem("servitechno_token", result.accessToken);
        sessionStorage.setItem("servitechno_user", JSON.stringify(result.user));
        setUser(result.user);
      },
      logout() {
        sessionStorage.clear();
        setUser(null);
      },
      can(permission) {
        return user?.permissions.includes(permission) ?? false;
      },
    }),
    [user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider requerido");
  return value;
}
