import { useState, useEffect, useCallback } from 'react'

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const ROWS = 8

const getThisWeekStart = () => {
  const t = new Date()
  const day = t.getDay()
  const d = new Date(t)
  d.setDate(t.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}
const getWeekStart = (offset) => {
  const d = new Date(getThisWeekStart())
  d.setDate(d.getDate() + offset * 7)
  return d
}
const getDate = (weekStart, i) => {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + i)
  return d
}
const fmt = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayStr = () => fmt(new Date())

export default function Home() {
  const [authToken, setAuthToken] = useState(null) // {accessToken, refreshToken}
  const [authReady, setAuthReady] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [tasks, setTasks] = useState([])
  const [inputs, setInputs] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [manualCode, setManualCode] = useState('')

  // 토큰 로드 (localStorage + postMessage 수신)
  useEffect(() => {
    // 1) localStorage에서 복원
    try {
      const saved = localStorage.getItem('gtask_token')
      if (saved) {
        const decoded = JSON.parse(atob(saved))
        setAuthToken(decoded)
      }
    } catch (e) {}
    setAuthReady(true)

    // 2) 새 탭(connected 페이지)에서 postMessage로 토큰 받기
    const onMessage = (ev) => {
      if (ev.data?.type === 'GTASK_TOKEN' && ev.data.payload) {
        try {
          const decoded = JSON.parse(atob(ev.data.payload))
          setAuthToken(decoded)
          localStorage.setItem('gtask_token', ev.data.payload)
        } catch (e) {}
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const weekStartStr = fmt(getWeekStart(weekOffset))

  const getWeekLabel = () => {
    const s = getWeekStart(weekOffset)
    const e = getDate(s, 6)
    return (
      `${s.getMonth() + 1}월 ${s.getDate()}일 ~ ${e.getMonth() + 1}월 ${e.getDate()}일` +
      (weekOffset === 0 ? ' (이번 주)' : '')
    )
  }

  const callApi = useCallback(async (body) => {
    if (!authToken) throw new Error('로그인이 필요합니다.')
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.accessToken}`,
        ...(authToken.refreshToken ? { 'x-refresh-token': authToken.refreshToken } : {}),
      },
      body: JSON.stringify(body),
    })
    // 새 access token이 내려오면 갱신
    const newToken = res.headers.get('x-new-access-token')
    if (newToken) {
      const updated = { ...authToken, accessToken: newToken }
      setAuthToken(updated)
      try { localStorage.setItem('gtask_token', btoa(JSON.stringify(updated))) } catch (e) {}
    }
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '요청 실패')
    return data
  }, [authToken])

  const load = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    setError('')
    try {
      const data = await callApi({ action: 'list', weekStart: weekStartStr })
      setTasks(data.tasks)
    } catch (e) {
      setError('불러오기 실패: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [authToken, weekStartStr, callApi])

  useEffect(() => {
    load()
  }, [load])

  // 로그인 안 된 상태에서 localStorage 토큰 확인 (새 탭 로그인 자동 감지)
  useEffect(() => {
    if (authToken) return
    const timer = setInterval(() => {
      try {
        const saved = localStorage.getItem('gtask_token')
        if (saved) {
          const decoded = JSON.parse(atob(saved))
          setAuthToken(decoded)
        }
      } catch (e) {}
    }, 1500)
    return () => clearInterval(timer)
  }, [authToken])

  const handleAdd = async (dt) => {
    const title = inputs[dt]?.trim()
    if (!title) return
    setInputs((prev) => ({ ...prev, [dt]: '' }))
    try {
      await callApi({ action: 'add', date: dt, title })
      load()
    } catch (e) {
      setError('추가 실패: ' + e.message)
    }
  }

  const handleToggle = async (id, done) => {
    try {
      await callApi({ action: 'toggle', id, done })
      load()
    } catch (e) {
      setError('업데이트 실패: ' + e.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await callApi({ action: 'delete', id })
      load()
    } catch (e) {
      setError('삭제 실패: ' + e.message)
    }
  }

  if (!authReady) {
    return <div style={styles.center}>로딩 중...</div>
  }

  if (!authToken) {
    const handleLogin = () => {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      window.open(origin + '/api/auth/signin', '_blank', 'noopener,noreferrer')
    }
    const applyManualCode = () => {
      const code = manualCode.trim()
      if (!code) return
      try {
        const decoded = JSON.parse(atob(code))
        if (!decoded.accessToken) throw new Error('invalid')
        setAuthToken(decoded)
        localStorage.setItem('gtask_token', code)
        setError('')
      } catch (e) {
        setError('코드가 올바르지 않습니다.')
      }
    }
    return (
      <div style={styles.loginWrap}>
        <div style={styles.loginCard}>
          <div style={styles.loginTitle}>주간 플래너</div>
          <div style={styles.loginSub}>구글 캘린더 할일과 연동됩니다</div>
          <button style={styles.loginBtn} onClick={handleLogin}>
            <GoogleIcon />
            Google로 로그인
          </button>
          <div style={styles.loginHint}>
            새 탭에서 로그인하면 자동 연결됩니다.<br />
            연결이 안 되면 새 탭에서 받은 코드를<br />아래에 붙여넣으세요.
          </div>
          <input
            style={styles.codeInput}
            placeholder="연결 코드 붙여넣기"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <button style={styles.refreshBtn} onClick={applyManualCode}>
            코드로 연결
          </button>
          {error && <div style={{ ...styles.err, marginTop: 10 }}>{error}</div>}
        </div>
      </div>
    )
  }

  const today = todayStr()

  return (
    <div style={styles.wrap}>
      {/* 상단 바 */}
      <div style={styles.topbar}>
        <button style={styles.navBtn} onClick={() => setWeekOffset((o) => o - 1)}>‹</button>
        <span style={styles.weekLabel}>{getWeekLabel()}</span>
        <button style={styles.navBtn} onClick={() => setWeekOffset((o) => o + 1)}>›</button>
        <button style={styles.todayBtn} onClick={() => setWeekOffset(0)}>오늘</button>
        <button style={styles.syncBtn} onClick={load} title="새로고침">↻</button>
        <button
          style={styles.logoutBtn}
          onClick={() => {
            try { localStorage.removeItem('gtask_token') } catch (e) {}
            setAuthToken(null)
            setTasks([])
          }}
        >
          로그아웃
        </button>
      </div>

      {error && <div style={styles.err}>{error}</div>}
      {loading && <div style={styles.loadingBar} />}

      <div className="planner-grid">
        {DAYS.map((day, i) => {
          const date = getDate(getWeekStart(weekOffset), i)
          const dt = fmt(date)
          const isToday = dt === today
          const isSat = i === 5
          const isSun = i === 6
          const dayTasks = tasks.filter((t) => t.date === dt)
          const headerColor = isToday ? '#FFB6C1' : isSat ? '#5b8dd9' : isSun ? '#e05a5a' : '#888'

          return (
            <div key={day} style={styles.column}>
              <div style={{ ...styles.colHeader, color: headerColor, fontWeight: isToday ? 700 : 500 }}>
                <span>{day}</span>
                <span className="col-date"> {date.getMonth() + 1}/{date.getDate()}</span>
              </div>

              <div style={styles.tasksArea}>
                {Array.from({ length: ROWS }).map((_, j) => {
                  const task = dayTasks[j] || null
                  return (
                    <div key={j} style={styles.row} className="task-row">
                      <input
                        type="checkbox"
                        style={styles.check}
                        checked={task?.done || false}
                        disabled={!task}
                        onChange={() => task && handleToggle(task.id, task.done)}
                      />
                      <div style={styles.line}>
                        <span style={{ ...styles.text, ...(task?.done ? styles.textDone : {}) }}>
                          {task?.title || ''}
                        </span>
                      </div>
                      {task && (
                        <button style={styles.del} onClick={() => handleDelete(task.id)}>
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={styles.inputRow}>
                <input
                  style={styles.inputField}
                  placeholder="추가..."
                  value={inputs[dt] || ''}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [dt]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd(dt)}
                />
                <button style={styles.addBtn} onClick={() => handleAdd(dt)}>+</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: 8 }}>
    <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
    <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
    <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
    <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z"/>
  </svg>
)

const styles = {
  wrap: { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: '#fff', minHeight: '100vh', color: '#333' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#999' },
  loginWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fafafa' },
  loginCard: { background: '#fff', border: '0.5px solid #eee', borderRadius: 12, padding: '2.5rem 2rem', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' },
  loginTitle: { fontSize: 22, fontWeight: 600, color: '#333', marginBottom: 8 },
  loginSub: { fontSize: 13, color: '#999', marginBottom: 28 },
  loginBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, background: '#fff', border: '0.5px solid #ddd', borderRadius: 8, padding: '10px 24px', fontSize: 14, color: '#444', cursor: 'pointer', transition: 'background 0.2s', width: '100%' },
  loginHint: { fontSize: 11, color: '#aaa', marginTop: 18, lineHeight: 1.5 },
  codeInput: { width: '100%', marginTop: 14, padding: '8px 10px', fontSize: 11, border: '0.5px solid #ddd', borderRadius: 6, outline: 'none', color: '#666' },
  refreshBtn: { marginTop: 12, background: '#FFB6C1', border: 'none', color: '#fff', borderRadius: 8, padding: '9px 20px', fontSize: 13, cursor: 'pointer', width: '100%', fontWeight: 500 },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0.9rem 1rem', flexWrap: 'wrap' },
  navBtn: { background: '#fff', border: '0.5px solid #FFB6C1', color: '#FFB6C1', borderRadius: 6, width: 32, height: 32, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  weekLabel: { fontSize: 13, fontWeight: 500, color: '#555', minWidth: 180, textAlign: 'center' },
  todayBtn: { background: '#fff', border: '0.5px solid #ddd', color: '#888', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' },
  listSelect: { background: '#fff', border: '0.5px solid #FFB6C1', color: '#888', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', outline: 'none', maxWidth: 140 },
  syncBtn: { background: '#fff', border: '0.5px solid #ddd', color: '#aaa', borderRadius: 6, width: 28, height: 28, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logoutBtn: { background: '#fff', border: '0.5px solid #ddd', color: '#888', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' },
  err: { margin: '0 1rem 0.5rem', padding: '8px 12px', background: '#ffebeb', color: '#e24b4a', borderRadius: 6, fontSize: 12 },
  loadingBar: { height: 2, background: '#FFB6C1', opacity: 0.6 },
  column: { borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd', display: 'flex', flexDirection: 'column', background: '#fff' },
  colHeader: { fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'center', padding: '7px 4px 6px', borderBottom: '1px solid #ddd', whiteSpace: 'nowrap' },
  tasksArea: { flex: 1 },
  row: { display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', height: 32, borderBottom: '0.5px solid #eee', position: 'relative' },
  check: { width: 14, height: 14, flexShrink: 0 },
  line: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' },
  text: { fontSize: 11, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#333' },
  textDone: { color: '#bbb', textDecoration: 'line-through' },
  del: { background: 'none', border: 'none', color: '#ddd', cursor: 'pointer', fontSize: 11, padding: 0, width: 13, height: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s' },
  inputRow: { display: 'flex', gap: 4, padding: '5px 6px', borderTop: '1px solid #ddd', marginTop: 'auto' },
  inputField: { flex: 1, minWidth: 0, padding: '4px 5px', fontSize: 11, border: '0.5px solid #ddd', borderRadius: 5, outline: 'none', color: '#333', background: '#fff' },
  addBtn: { background: '#fff', color: '#FFB6C1', border: '0.5px solid #FFB6C1', borderRadius: 5, cursor: 'pointer', fontSize: 15, width: 25, height: 25, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
}