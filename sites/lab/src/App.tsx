import type { CSSProperties, FormEvent } from "react"
import type { Session } from "@supabase/supabase-js"
import { useEffect, useState } from "react"
import { isSupabaseConfigured, supabase, supabasePublishableKey, supabaseUrl } from "./lib/supabase"

type StudyApp = {
  id: "definition" | "jumo"
  title: string
  shortTitle: string
  accent: string
  frameSrc: string
}

const apps: StudyApp[] = [
  {
    id: "definition",
    title: "정의 삑삑이",
    shortTitle: "정의",
    accent: "#3f7ae3",
    frameSrc: "/apps/definition/",
  },
  {
    id: "jumo",
    title: "주모 삑삑이",
    shortTitle: "주모",
    accent: "#3f7ae3",
    frameSrc: "/apps/jumo/",
  },
]

const SIDEBAR_STATE_KEY = "haorio.study.sidebar.collapsed"
const SAVED_CREDENTIALS_KEY = "haorio.study.savedCredentials.v1"
const STUDY_AUTH_BRIDGE_KEY = "haorio.study.auth.v1"
const STUDY_GUEST_MODE_KEY = "haorio.study.guest.v1"
const STUDY_AUTH_MESSAGE_TYPE = "haorio.study.auth"

type StudyAuthBridge = {
  userId: string
  email: string
  accessToken: string
  expiresAt?: number
  supabaseUrl: string
  supabasePublishableKey: string
}

function createStudyAuthBridge(session: Session): StudyAuthBridge | null {
  if (!supabaseUrl || !supabasePublishableKey) return null

  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    accessToken: session.access_token,
    expiresAt: session.expires_at,
    supabaseUrl,
    supabasePublishableKey,
  }
}

function writeStudyAuthBridge(session: Session | null) {
  if (typeof window === "undefined") return null

  if (!session) {
    window.localStorage.removeItem(STUDY_AUTH_BRIDGE_KEY)
    return null
  }

  const bridge = createStudyAuthBridge(session)
  if (!bridge) return null

  window.sessionStorage.removeItem(STUDY_GUEST_MODE_KEY)
  window.localStorage.setItem(STUDY_AUTH_BRIDGE_KEY, JSON.stringify(bridge))
  return bridge
}

function createFrameSrc(src: string, isGuestMode: boolean) {
  if (!isGuestMode) return src

  const separator = src.includes("?") ? "&" : "?"
  return `${src}${separator}mode=guest`
}

function sendStudyAuthToFrame(frame: HTMLIFrameElement, session: Session | null, isGuestMode: boolean) {
  if (isGuestMode) {
    writeStudyAuthBridge(null)
    frame.contentWindow?.postMessage(
      {
        type: STUDY_AUTH_MESSAGE_TYPE,
        guest: true,
      },
      window.location.origin,
    )
    return
  }

  const bridge = writeStudyAuthBridge(session)
  if (!bridge || !frame.contentWindow) return

  frame.contentWindow.postMessage(
    {
      type: STUDY_AUTH_MESSAGE_TYPE,
      auth: bridge,
    },
    window.location.origin,
  )
}

function loadInitialSidebarState() {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(SIDEBAR_STATE_KEY) === "true"
}

function loadInitialGuestMode() {
  if (typeof window === "undefined") return false
  return window.sessionStorage.getItem(STUDY_GUEST_MODE_KEY) === "true"
}

function loadSavedCredentials() {
  if (typeof window === "undefined") {
    return { email: "", password: "", remember: false }
  }

  try {
    const raw = window.localStorage.getItem(SAVED_CREDENTIALS_KEY)
    if (!raw) return { email: "", password: "", remember: false }

    const parsed = JSON.parse(raw) as {
      email?: string
      password?: string
      remember?: boolean
    }

    return {
      email: parsed.email ?? "",
      password: parsed.password ?? "",
      remember: Boolean(parsed.remember),
    }
  } catch {
    return { email: "", password: "", remember: false }
  }
}

function App() {
  const savedCredentials = loadSavedCredentials()
  const [activeAppId, setActiveAppId] = useState<StudyApp["id"]>("definition")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(loadInitialSidebarState)
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "reset-request" | "reset-password">("signin")
  const [email, setEmail] = useState(savedCredentials.email)
  const [password, setPassword] = useState(savedCredentials.password)
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [rememberCredentials, setRememberCredentials] = useState(savedCredentials.remember)
  const [authMessage, setAuthMessage] = useState("")
  const [authMessageIsError, setAuthMessageIsError] = useState(false)
  const [showSignupNotice, setShowSignupNotice] = useState(false)
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [isGuestMode, setIsGuestMode] = useState(loadInitialGuestMode)
  const activeApp = apps.find((app) => app.id === activeAppId) ?? apps[0]

  useEffect(() => {
    if (!supabase) return

    let isMounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return
      if (error) {
        setAuthMessageIsError(true)
        setAuthMessage("로그인 정보를 확인하는 중 문제가 발생했습니다.")
        return
      }
      setSession(data.session)
      if (data.session) {
        setIsGuestMode(false)
      }
      if (window.location.href.includes("type=recovery")) {
        setAuthMode("reset-password")
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("reset-password")
      }
      setSession(nextSession)
      if (nextSession) {
        setIsGuestMode(false)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    writeStudyAuthBridge(session)
  }, [session])

  function toggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(SIDEBAR_STATE_KEY, String(next))
      return next
    })
  }

  function persistCredentials(nextEmail: string, nextPassword: string, shouldRemember: boolean) {
    if (shouldRemember) {
      window.localStorage.setItem(
        SAVED_CREDENTIALS_KEY,
        JSON.stringify({
          email: nextEmail,
          password: nextPassword,
          remember: true,
        }),
      )
      return
    }

    window.localStorage.removeItem(SAVED_CREDENTIALS_KEY)
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setAuthMessageIsError(true)
      setAuthMessage("지금은 로그인 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.")
      return
    }

    setIsAuthBusy(true)
    setAuthMessage("")
    setAuthMessageIsError(false)

    try {
      if (authMode === "signup") {
        if (password !== passwordConfirm) {
          throw new Error("비밀번호 확인이 일치하지 않습니다.")
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
          },
        })

        if (error) throw error

        persistCredentials(email, password, rememberCredentials)

        if (data.session) {
          setAuthMessage("회원가입과 로그인이 완료되었습니다.")
        } else {
          setPassword("")
          setPasswordConfirm("")
          setAuthMode("signin")
          setShowSignupNotice(true)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error
        persistCredentials(email, password, rememberCredentials)
        setAuthMessage("로그인되었습니다.")
      }
    } catch (error) {
      setAuthMessageIsError(true)
      setAuthMessage(error instanceof Error ? error.message : "인증 중 오류가 발생했습니다.")
    } finally {
      setIsAuthBusy(false)
    }
  }

  async function handleSignOut() {
    if (!supabase) return

    setIsAuthBusy(true)
    setAuthMessage("")
    setAuthMessageIsError(false)

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })
      if (error) throw error
      window.localStorage.removeItem(STUDY_AUTH_BRIDGE_KEY)
      window.sessionStorage.removeItem(STUDY_GUEST_MODE_KEY)
      persistCredentials(email, password, rememberCredentials)
      setAuthMessage("로그아웃되었습니다.")
    } catch (error) {
      setAuthMessageIsError(true)
      setAuthMessage(error instanceof Error ? error.message : "로그아웃 중 오류가 발생했습니다.")
    } finally {
      setIsAuthBusy(false)
    }
  }

  function handleEnterGuestMode() {
    writeStudyAuthBridge(null)
    window.sessionStorage.setItem(STUDY_GUEST_MODE_KEY, "true")
    setAuthMessage("")
    setAuthMessageIsError(false)
    setIsGuestMode(true)
  }

  function handleExitGuestMode() {
    window.sessionStorage.removeItem(STUDY_GUEST_MODE_KEY)
    setIsGuestMode(false)
    setAuthMode("signin")
    setAuthMessage("모르는 카드만 보기와 아는 카드 체크를 사용하려면 로그인해주세요.")
    setAuthMessageIsError(false)
  }

  async function handleResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setAuthMessageIsError(true)
      setAuthMessage("지금은 로그인 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.")
      return
    }

    setIsAuthBusy(true)
    setAuthMessage("")
    setAuthMessageIsError(false)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      })

      if (error) throw error
      setAuthMessage("비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해주세요.")
    } catch (error) {
      setAuthMessageIsError(true)
      setAuthMessage(error instanceof Error ? error.message : "비밀번호 재설정 요청 중 오류가 발생했습니다.")
    } finally {
      setIsAuthBusy(false)
    }
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setAuthMessageIsError(true)
      setAuthMessage("지금은 로그인 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.")
      return
    }

    setIsAuthBusy(true)
    setAuthMessage("")
    setAuthMessageIsError(false)

    try {
      if (password !== passwordConfirm) {
        throw new Error("비밀번호 확인이 일치하지 않습니다.")
      }

      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      await supabase.auth.signOut({ scope: "local" })
      window.localStorage.removeItem(STUDY_AUTH_BRIDGE_KEY)
      window.sessionStorage.removeItem(STUDY_GUEST_MODE_KEY)
      setSession(null)
      setPassword("")
      setPasswordConfirm("")
      setAuthMode("signin")
      setAuthMessage("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.")
    } catch (error) {
      setAuthMessageIsError(true)
      setAuthMessage(error instanceof Error ? error.message : "비밀번호 변경 중 오류가 발생했습니다.")
    } finally {
      setIsAuthBusy(false)
    }
  }

  if ((!session && !isGuestMode) || authMode === "reset-password") {
    return (
      <main className="authGateShell">
        <section className="authServiceShell" aria-label="Login screen">
          <section className="authCard authCardGate" aria-label="Authentication">
            {authMode === "signup" ? (
              <>
                <button
                  className="authBackButton"
                  type="button"
                  onClick={() => {
                    setAuthMode("signin")
                    setAuthMessage("")
                    setAuthMessageIsError(false)
                  }}
                >
                  <span aria-hidden="true">←</span>
                  <strong>뒤로</strong>
                </button>

                <div className="authTitleBlock authTitleBlockCompact">
                  <h1>계정 신청</h1>
                  <p>새 계정을 만들기 위한 기본 정보를 입력해주세요.</p>
                </div>

                {isSupabaseConfigured ? (
                  <form className="authForm authFormGate" onSubmit={handleAuthSubmit}>
                    <p className="authSectionLabel">계정 정보</p>

                    <label className="authField authFieldIcon">
                      <span className="authFieldIconMark" aria-hidden="true">◌</span>
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="아이디(이메일)"
                        required
                      />
                    </label>

                    <label className="authField authFieldIcon">
                      <span className="authFieldIconMark" aria-hidden="true">□</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="비밀번호"
                        required
                      />
                    </label>

                    <label className="authField authFieldIcon">
                      <span className="authFieldIconMark" aria-hidden="true">□</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={passwordConfirm}
                        onChange={(event) => setPasswordConfirm(event.target.value)}
                        placeholder="비밀번호 확인"
                        required
                      />
                    </label>

                    <button className="authSubmit authSubmitPrimary" type="submit" disabled={isAuthBusy}>
                      {isAuthBusy ? "처리 중..." : "가입 신청하기"}
                    </button>
                  </form>
                ) : (
                  <p className="authMessage is-error">지금은 로그인 서비스를 준비 중입니다. 잠시 후 다시 시도해주세요.</p>
                )}
              </>
            ) : authMode === "reset-request" ? (
              <>
                <button
                  className="authBackButton"
                  type="button"
                  onClick={() => {
                    setAuthMode("signin")
                    setAuthMessage("")
                    setAuthMessageIsError(false)
                  }}
                >
                  <span aria-hidden="true">←</span>
                  <strong>뒤로</strong>
                </button>

                <div className="authTitleBlock authTitleBlockCompact">
                  <h1>비밀번호 찾기</h1>
                  <p>가입에 사용한 아이디(이메일)로 재설정 링크를 보내드립니다.</p>
                </div>

                {isSupabaseConfigured ? (
                  <form className="authForm authFormGate" onSubmit={handleResetRequest}>
                    <p className="authSectionLabel">계정 확인</p>

                    <label className="authField authFieldIcon">
                      <span className="authFieldIconMark" aria-hidden="true">◌</span>
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="아이디(이메일)"
                        required
                      />
                    </label>

                    <button className="authSubmit authSubmitPrimary" type="submit" disabled={isAuthBusy}>
                      {isAuthBusy ? "처리 중..." : "재설정 메일 보내기"}
                    </button>
                  </form>
                ) : (
                  <p className="authMessage is-error">지금은 로그인 서비스를 준비 중입니다. 잠시 후 다시 시도해주세요.</p>
                )}
              </>
            ) : authMode === "reset-password" ? (
              <>
                <div className="authTitleBlock authTitleBlockCompact authTitleBlockTop">
                  <h1>새 비밀번호 설정</h1>
                  <p>새 비밀번호를 입력한 뒤 바로 다시 로그인할 수 있습니다.</p>
                </div>

                {isSupabaseConfigured ? (
                  <form className="authForm authFormGate" onSubmit={handlePasswordUpdate}>
                    <p className="authSectionLabel">비밀번호 변경</p>

                    <label className="authField authFieldIcon">
                      <span className="authFieldIconMark" aria-hidden="true">□</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="새 비밀번호"
                        required
                      />
                    </label>

                    <label className="authField authFieldIcon">
                      <span className="authFieldIconMark" aria-hidden="true">□</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={passwordConfirm}
                        onChange={(event) => setPasswordConfirm(event.target.value)}
                        placeholder="새 비밀번호 확인"
                        required
                      />
                    </label>

                    <button className="authSubmit authSubmitPrimary" type="submit" disabled={isAuthBusy}>
                      {isAuthBusy ? "처리 중..." : "비밀번호 변경하기"}
                    </button>
                  </form>
                ) : (
                  <p className="authMessage is-error">지금은 로그인 서비스를 준비 중입니다. 잠시 후 다시 시도해주세요.</p>
                )}
              </>
            ) : (
              <>
                <div className="authMark" aria-hidden="true">
                  <span>🔒</span>
                </div>

                <div className="authTitleBlock">
                  <h1>ITPE로 성장하는 길</h1>
                  <p>학습 데이터를 이어서 관리하려면 로그인해주세요.</p>
                </div>

                {isSupabaseConfigured ? (
                  <>
                    <form className="authForm authFormGate" onSubmit={handleAuthSubmit}>
                      <label className="authField authFieldIcon">
                        <span className="authFieldIconMark" aria-hidden="true">◌</span>
                        <input
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder="아이디(이메일)"
                          required
                        />
                      </label>

                      <label className="authField authFieldIcon">
                        <span className="authFieldIconMark" aria-hidden="true">□</span>
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="비밀번호"
                          required
                        />
                      </label>

                      <label className="rememberRow">
                        <input
                          type="checkbox"
                          checked={rememberCredentials}
                          onChange={(event) => {
                            const next = event.target.checked
                            setRememberCredentials(next)
                            if (!next) {
                              window.localStorage.removeItem(SAVED_CREDENTIALS_KEY)
                            }
                          }}
                        />
                        <span>아이디와 패스워드 저장</span>
                      </label>

                      <button className="authSubmit authSubmitPrimary" type="submit" disabled={isAuthBusy}>
                        {isAuthBusy ? "처리 중..." : "로그인"}
                      </button>
                    </form>

                    <div className="authSwitchRow">
                      <span>계정이 없으신가요?</span>
                      <button className="authTextButton" type="button" onClick={() => setAuthMode("signup")}>
                        회원가입 신청
                      </button>
                    </div>

                    <div className="authSwitchRow authSwitchRowSecondary">
                      <button className="authTextButton" type="button" onClick={() => setAuthMode("reset-request")}>
                        비밀번호 찾기
                      </button>
                    </div>

                    <div className="authGuestRow">
                      <button className="authGuestButton" type="button" onClick={handleEnterGuestMode}>
                        로그인 없이 전체 카드 보기
                      </button>
                      <p>단발성으로 전체 카드를 볼 수 있어요. 모르는 카드만 보기와 아는 카드 체크는 로그인 후 사용할 수 있습니다.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="authMessage is-error">지금은 로그인 서비스를 준비 중입니다. 잠시 후 다시 시도해주세요.</p>
                    <div className="authGuestRow">
                      <button className="authGuestButton" type="button" onClick={handleEnterGuestMode}>
                        로그인 없이 전체 카드 보기
                      </button>
                      <p>로그인 서비스와 무관하게 전체 카드는 바로 확인할 수 있습니다.</p>
                    </div>
                  </>
                )}
              </>
            )}

            {authMessage ? (
              <p className={`authMessage${authMessageIsError ? " is-error" : ""}`}>{authMessage}</p>
            ) : null}
          </section>
        </section>

        {showSignupNotice ? (
          <div className="authModalLayer" role="presentation">
            <section className="authModal" role="dialog" aria-modal="true" aria-labelledby="signup-notice-title">
              <h2 id="signup-notice-title">이메일 인증이 필요합니다</h2>
              <p>가입이 완료되었습니다. 받은 편지함에서 인증 메일을 확인한 뒤 다시 로그인해주세요.</p>
              <button className="authModalButton" type="button" onClick={() => setShowSignupNotice(false)}>
                확인
              </button>
            </section>
          </div>
        ) : null}
      </main>
    )
  }

  return (
    <main className="shell" data-sidebar-collapsed={isSidebarCollapsed}>
      <aside className="sidebar" aria-label="Study app menu" data-collapsed={isSidebarCollapsed}>
        <a className="brand" href="/" aria-label="ITPE로 성장하는 길 home">
          <span className="brandMark">I</span>
          <span className="brandText">
            <strong>ITPE로 성장하는 길</strong>
            <small>study apps</small>
          </span>
        </a>

        <button
          className="sidebarToggle"
          type="button"
          aria-expanded={!isSidebarCollapsed}
          aria-label={isSidebarCollapsed ? "Show study app tabs" : "Hide study app tabs"}
          onClick={toggleSidebar}
        >
          <span>{isSidebarCollapsed ? ">" : "<"}</span>
          <strong>{isSidebarCollapsed ? "탭 열기" : "탭 숨기기"}</strong>
        </button>

        <nav className="tabList" aria-label="Study apps">
          {apps.map((app) => {
            const isActive = app.id === activeApp.id
            return (
              <button
                key={app.id}
                className="tabButton"
                type="button"
                aria-current={isActive ? "page" : undefined}
                data-active={isActive}
                onClick={() => {
                  setActiveAppId(app.id)
                  window.localStorage.setItem(SIDEBAR_STATE_KEY, "true")
                  setIsSidebarCollapsed(true)
                }}
                style={{ "--app-accent": app.accent } as CSSProperties}
              >
                <span>{app.shortTitle}</span>
                <strong className="tabLabel">{app.title}</strong>
              </button>
            )
          })}
        </nav>
      </aside>

      <button
        className="floatingSidebarToggle"
        type="button"
        aria-expanded={!isSidebarCollapsed}
        aria-label={isSidebarCollapsed ? "Show study app tabs" : "Hide study app tabs"}
        onClick={toggleSidebar}
      >
        <span>{isSidebarCollapsed ? "+" : "x"}</span>
        <strong>{isSidebarCollapsed ? "탭 열기" : "탭 숨기기"}</strong>
      </button>

      <button
        className="floatingLogoutButton"
        type="button"
        onClick={isGuestMode ? handleExitGuestMode : handleSignOut}
        disabled={!isGuestMode && isAuthBusy}
      >
        {isGuestMode ? "로그인하기" : isAuthBusy ? "처리 중..." : "로그아웃"}
      </button>

      <button
        className="sidebarBackdrop"
        type="button"
        aria-hidden={isSidebarCollapsed}
        tabIndex={isSidebarCollapsed ? -1 : 0}
        onClick={toggleSidebar}
      />

      <section className="workspace" aria-live="polite">
        <div className="appMount" style={{ "--app-accent": activeApp.accent } as CSSProperties}>
          <div className="frameShell">
            <iframe
              key={`${activeApp.id}-${isGuestMode ? "guest" : "account"}`}
              className="studyFrame"
              src={createFrameSrc(activeApp.frameSrc, isGuestMode)}
              title={activeApp.title}
              loading="lazy"
              onLoad={(event) => sendStudyAuthToFrame(event.currentTarget, session, isGuestMode)}
            />
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
