import { getServerSession } from 'next-auth'
import { authOptions } from './auth/[...nextauth]'

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1'

// 날짜(YYYY-MM-DD) → RFC3339 due date (Google Tasks 형식)
const toRFC3339 = (dateStr) => `${dateStr}T00:00:00.000Z`

// RFC3339 → YYYY-MM-DD
const fromRFC3339 = (rfc) => rfc?.slice(0, 10)

// 만료된 access token을 refresh token으로 갱신
async function refreshGoogleToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'token refresh failed')
  return data.access_token
}

export default async function handler(req, res) {
  let token = null

  // 1) Authorization 헤더의 토큰 우선 (데스크톱 앱/iframe용)
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7)

    // 헤더로 refresh token도 같이 보내면, 401 시 갱신용으로 사용
    const refreshToken = req.headers['x-refresh-token']

    // 토큰 유효성 간단 체크 후 만료면 갱신
    if (refreshToken) {
      const testRes = await fetch(`${TASKS_API}/users/@me/lists`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (testRes.status === 401) {
        try {
          token = await refreshGoogleToken(refreshToken)
          res.setHeader('x-new-access-token', token) // 새 토큰을 클라에 전달
        } catch (e) {
          return res.status(401).json({ error: '토큰 갱신 실패. 다시 로그인해주세요.' })
        }
      }
    }
  }

  // 2) 헤더 토큰이 없으면 쿠키 세션 사용 (웹용)
  if (!token) {
    const session = await getServerSession(req, res, authOptions)
    token = session?.accessToken
  }

  if (!token) {
    return res.status(401).json({ error: '로그인이 필요합니다.' })
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // 기본 태스크 목록 ID 가져오기
  const getListId = async () => {
    const r = await fetch(`${TASKS_API}/users/@me/lists`, { headers })
    const data = await r.json()
    return data
  }

  try {
    const { action } = req.body || req.query

    // 목록(Task List) 전체 조회
    if (action === 'getLists') {
      const r = await fetch(`${TASKS_API}/users/@me/lists`, { headers })
      const data = await r.json()
      console.log('getLists raw response:', JSON.stringify(data))
      const lists = (data.items || []).map((l) => ({ id: l.id, title: l.title }))
      return res.json({ lists })
    }

    // 주간 할일 목록 조회
    if (action === 'list') {
      const { weekStart } = req.body
      const listId = await getListId()

      const startDate = weekStart
      const endDateObj = new Date(weekStart)
      endDateObj.setDate(endDateObj.getDate() + 6)
      const endDate = fromRFC3339(endDateObj.toISOString())

      for(id : listId)
      const url = new URL(`${TASKS_API}/lists/${listId.id}/tasks`)
      url.searchParams.set('showCompleted', 'true')
      url.searchParams.set('showHidden', 'true')
      url.searchParams.set('maxResults', '100')

      const r = await fetch(url.toString(), { headers })
      const data = await r.json()

      const tasks = (data.items || [])
        .filter((t) => {
          if (!t.due) return false
          const due = fromRFC3339(t.due)
          return due >= startDate && due <= endDate
        })
        .map((t) => ({
          id: t.id,
          title: t.title,
          done: t.status === 'completed',
          date: fromRFC3339(t.due),
        }))

      return res.json({ tasks })
    }

    // 할일 추가
    // 주간 할일 목록 조회
if (action === 'list') {
  const { weekStart } = req.body
  const listsData = await getListId() // 수정하신 대로 data 전체를 반환한다고 가정

  const startDate = weekStart
  const endDateObj = new Date(weekStart)
  endDateObj.setDate(endDateObj.getDate() + 6)
  const endDate = fromRFC3339(endDateObj.toISOString())

  // 1. 모든 할 일을 모아둘 빈 배열을 준비합니다.
  let allTasks = []

  // 2. 자바스크립트의 for...of 문법을 사용해 목록을 하나씩 순회합니다.
  for (const list of listsData.items || []) {
    const url = new URL(`${TASKS_API}/lists/${list.id}/tasks`)
    url.searchParams.set('showCompleted', 'true')
    url.searchParams.set('showHidden', 'true')
    url.searchParams.set('maxResults', '100')

    const r = await fetch(url.toString(), { headers })
    const data = await r.json()

    // 3. 이번 주 날짜에 맞게 필터링
    const tasks = (data.items || [])
      .filter((t) => {
        if (!t.due) return false
        const due = fromRFC3339(t.due)
        return due >= startDate && due <= endDate
      })
      .map((t) => ({
        id: t.id,
        listId: list.id, // 🔥 핵심! 나중에 수정/삭제를 위해 목록 ID를 꼭 끼워넣어 줍니다.
        title: t.title,
        done: t.status === 'completed',
        date: fromRFC3339(t.due),
      }))

    // 4. 모아둔 배열에 방금 가져온 할 일들을 추가합니다.
    allTasks = [...allTasks, ...tasks]
  }

  // 5. 합쳐진 전체 할 일을 반환합니다.
  return res.json({ tasks: allTasks })
}

    // 할일 삭제
    if (action === 'delete') {
      const { id } = req.body
      const listId = await getListId()

      await fetch(`${TASKS_API}/lists/${listId}/tasks/${id}`, {
        method: 'DELETE',
        headers,
      })
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: '알 수 없는 액션입니다.' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: e.message })
  }
}