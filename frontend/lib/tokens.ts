const ACCESS_KEY = "aifitness.accessToken";
const REFRESH_KEY = "aifitness.refreshToken";

export const tokenStore = {
  getAccess(): string | null {
    return typeof window === "undefined" ? null : window.localStorage.getItem(ACCESS_KEY);
  },
  getRefresh(): string | null {
    return typeof window === "undefined" ? null : window.localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACCESS_KEY, access);
    window.localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  },
};
