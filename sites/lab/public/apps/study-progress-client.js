(function () {
  const AUTH_KEY = "haorio.study.auth.v1";
  const GUEST_KEY = "haorio.study.guest.v1";
  const AUTH_MESSAGE_TYPE = "haorio.study.auth";
  const AUTH_CHANGE_EVENT = "haorio-study-auth-change";

  function readStoredAuth() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      const auth = JSON.parse(raw);
      if (!auth?.userId || !auth?.accessToken || !auth?.supabaseUrl || !auth?.supabasePublishableKey) {
        return null;
      }
      return auth;
    } catch {
      return null;
    }
  }

  function writeStoredAuth(auth) {
    if (!auth?.userId || !auth?.accessToken) return;
    sessionStorage.removeItem(GUEST_KEY);
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  }

  function writeGuestMode() {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.setItem(GUEST_KEY, "true");
  }

  function getAuth() {
    if (isGuestMode()) return null;
    return readStoredAuth();
  }

  function isGuestMode() {
    return sessionStorage.getItem(GUEST_KEY) === "true";
  }

  function getAccount() {
    const auth = getAuth();
    if (!auth) return null;
    return {
      id: auth.userId,
      label: auth.email || "현재 계정",
    };
  }

  async function requestSupabase(path, options = {}) {
    const auth = getAuth();
    if (!auth) throw new Error("로그인 정보를 확인할 수 없습니다.");

    const response = await fetch(`${auth.supabaseUrl}${path}`, {
      ...options,
      headers: {
        apikey: auth.supabasePublishableKey,
        Authorization: `Bearer ${auth.accessToken}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 204) return null;

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || "학습 기록 동기화에 실패했습니다.");
    }

    return payload;
  }

  function progressPath(appKey, resourceKey) {
    const app = encodeURIComponent(appKey);
    const resource = encodeURIComponent(resourceKey);
    return `/rest/v1/study_progress?app_key=eq.${app}&resource_key=eq.${resource}&select=progress`;
  }

  async function loadKnown(appKey, resourceKey) {
    const rows = await requestSupabase(progressPath(appKey, resourceKey));
    const progress = Array.isArray(rows) ? rows[0]?.progress : null;
    return {
      account: getAccount(),
      known: Array.isArray(progress?.known) ? progress.known : [],
    };
  }

  async function saveKnown(appKey, resourceKey, known) {
    const auth = getAuth();
    if (!auth) throw new Error("로그인 정보를 확인할 수 없습니다.");

    await requestSupabase("/rest/v1/study_progress?on_conflict=user_id,app_key,resource_key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: auth.userId,
        app_key: appKey,
        resource_key: resourceKey,
        progress: {
          known: [...new Set(known)],
          savedAt: new Date().toISOString(),
        },
      }),
    });

    return {
      account: getAccount(),
      known,
    };
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== AUTH_MESSAGE_TYPE) return;

    if (event.data.guest) {
      writeGuestMode();
      window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
      return;
    }

    writeStoredAuth(event.data.auth);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
  });

  window.HaorioStudyProgress = {
    getAccount,
    isGuestMode,
    loadKnown,
    saveKnown,
    authChangeEvent: AUTH_CHANGE_EVENT,
  };
})();
