import { useSession, signIn, signOut } from 'next-auth/react'
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
  const { data: session, status } = useSession()
  const [weekOffset, setWeekOffset] = useState(0)
  const [tasks, setTasks] = useState([])
  const [inputs, setInputs] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [taskLists, setTaskLists] = useState([])
  const [selectedListId, setSelectedListId] = useState('')

  const weekStart = getWeekStart(weekOffset)

  const getWeekLabel = () => {
    const s = weekStart
    const e = getDate(weekStart, 6)
    return (
      `${s.getMonth() + 1}월 ${s.getDate()}일 ~ ${e.getMonth() + 1}월 ${e.getDate()}일` +
      (weekOffset === 0 ? ' (이번 주)' : '')
    )
  }

  const callApi = useCallback(async (body) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '요청 실패')
    return data
  }, [])

  // 목록 가져오기 (최초 1회)
  useEffect(() => {
    if (!session) return
    callApi({ action: 'getLists' }).then((data) => {
      const lists = data.lists || []
      setTaskLists(lists)
      if (lists.length > 0 && !selectedListId) {
        setSelectedListId(lists[0].id)
      }
    }).catch((e) => {
      console.error('getLists error:', e)
      // 실패해도 기본값으로 진행
      setSelectedListId('default')
    })
  }, [session]) // callApi 의존성 제거해서 재실행 방지

  const load = useCallback(async () => {
    if (!session || !selectedListId) return
    setLoading(true)
    setError('')
    try {
      const data = await callApi({ action: 'list', weekStart: fmt(weekStart), listId: selectedListId })
      setTasks(data.tasks)
    } catch (e) {
      setError('불러오기 실패: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [session, weekStart, callApi, selectedListId])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async (dt) => {
    const title = inputs[dt]?.trim()
    if (!title) return
    setInputs((prev) => ({ ...prev, [dt]: '' }))
    try {
      await callApi({ action: 'add', date: dt, title, listId: selectedListId })
      load()
    } catch (e) {
      setError('추가 실패: ' + e.message)
    }
  }

  const handleToggle = async (id, done) => {
    try {
      await callApi({ action: 'toggle', id, done, listId: selectedListId })
      load()
    } catch (e) {
      setError('업데이트 실패: ' + e.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await callApi({ action: 'delete', id, listId: selectedListId })
      load()
    } catch (e) {
      setError('삭제 실패: ' + e.message)
    }
  }

  if (status === 'loading') {
    return <div style={styles.center}>로딩 중...</div>
  }

  if (!session) {
    return (
      <div style={styles.loginWrap}>
        <div style={styles.loginCard}>
          <div style={styles.loginTitle}>주간 플래너</div>
          <div style={styles.loginSub}>구글 캘린더 할일과 연동됩니다</div>
          <button style={styles.loginBtn} onClick={() => signIn('google')}>
            <GoogleIcon />
            Google로 로그인
          </button>
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
        <select
          style={styles.listSelect}
          value={selectedListId}
          onChange={(e) => setSelectedListId(e.target.value)}
        >
          {taskLists.length > 0 ? (
            taskLists.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))
          ) : (
            <option value="">목록 불러오는 중...</option>
          )}
        </select>
        <button style={styles.syncBtn} onClick={load} title="새로고침">↻</button>
        <button
          style={styles.logoutBtn}
          onClick={() => signOut()}
          title={session.user?.email}
        >
          {session.user?.name?.split(' ')[0] || '로그아웃'}
        </button>
      </div>

      {error && <div style={styles.err}>{error}</div>}
      {loading && <div style={styles.loadingBar} />}

      <div className="planner-grid">
        {DAYS.map((day, i) => {
          const date = getDate(weekStart, i)
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
