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
    const refreshToken = req.headers['x-refresh-token']

    // 토큰 만료 시 갱신
    if (refreshToken) {
      const testRes = await fetch(`${TASKS_API}/users/@me/lists`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (testRes.status === 401) {
        try {
          token = await refreshGoogleToken(refreshToken)
          res.setHeader('x-new-access-token', token)
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

  // 모든 목록(Task List) 가져오기
  const getAllLists = async () => {
    const r = await fetch(`${TASKS_API}/users/@me/lists`, { headers })
    const data = await r.json()
    return data.items || []
  }

  // 기본 목록 ID (첫 번째 목록)
  const getDefaultListId = async () => {
    const lists = await getAllLists()
    return lists[0]?.id
  }

  try {
    const { action } = req.body || req.query

    // 목록 전체 조회
    if (action === 'getLists') {
      const lists = await getAllLists()
      return res.json({ lists: lists.map((l) => ({ id: l.id, title: l.title })) })
    }

    // 주간 할일 조회 — 특정 목록 또는 전체 목록
    if (action === 'list') {
      const { weekStart, listId } = req.body

      const startDate = weekStart
      const endDateObj = new Date(weekStart)
      endDateObj.setDate(endDateObj.getDate() + 6)
      const endDate = fromRFC3339(endDateObj.toISOString())

      // listId가 'all'이거나 없으면 전체 목록, 아니면 해당 목록만
      let targetLists = []
      if (!listId || listId === 'all') {
        targetLists = await getAllLists()
      } else {
        targetLists = [{ id: listId }]
      }

      let allTasks = []
      for (const list of targetLists) {
        const url = new URL(`${TASKS_API}/lists/${list.id}/tasks`)
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
            listId: list.id, // 수정/삭제 시 필요
            title: t.title,
            done: t.status === 'completed',
            date: fromRFC3339(t.due),
          }))

        allTasks = [...allTasks, ...tasks]
      }

      return res.json({ tasks: allTasks })
    }

    // 할일 추가
    if (action === 'add') {
      const { date, title, listId } = req.body
      const targetListId = listId && listId !== 'all' ? listId : await getDefaultListId()

      const r = await fetch(`${TASKS_API}/lists/${targetListId}/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title,
          due: toRFC3339(date),
          status: 'needsAction',
        }),
      })
      const data = await r.json()
      if (!r.ok) {
        return res.status(r.status).json({ error: data.error?.message || 'add 실패' })
      }
      return res.json({ id: data.id })
    }

    // 완료 토글
    if (action === 'toggle') {
      const { id, done, listId } = req.body
      const targetListId = listId || await getDefaultListId()

      const r = await fetch(`${TASKS_API}/lists/${targetListId}/tasks/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: done ? 'needsAction' : 'completed',
        }),
      })
      const data = await r.json()
      return res.json({ ok: true, status: data.status })
    }

    // 할일 삭제
    if (action === 'delete') {
      const { id, listId } = req.body
      const targetListId = listId || await getDefaultListId()

      await fetch(`${TASKS_API}/lists/${targetListId}/tasks/${id}`, {
        method: 'DELETE',
        headers,
      })
      return res.json({ ok: true })
    }

    // 할일을 다른 목록으로 이동 (Tasks API는 이동 미지원 → 삭제 후 재생성)
    if (action === 'move') {
      const { id, fromListId, toListId } = req.body
      if (!fromListId || !toListId) {
        return res.status(400).json({ error: '목록 정보가 부족합니다.' })
      }
      if (fromListId === toListId) {
        return res.json({ ok: true }) // 같은 목록이면 변화 없음
      }

      // 1) 기존 할일 정보 읽기
      const getR = await fetch(`${TASKS_API}/lists/${fromListId}/tasks/${id}`, { headers })
      const original = await getR.json()
      if (!getR.ok) {
        return res.status(getR.status).json({ error: '원본 할일을 찾을 수 없습니다.' })
      }

      // 2) 새 목록에 동일 내용으로 생성
      const createR = await fetch(`${TASKS_API}/lists/${toListId}/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: original.title,
          due: original.due,
          notes: original.notes,
          status: original.status,
        }),
      })
      const created = await createR.json()
      if (!createR.ok) {
        return res.status(createR.status).json({ error: '새 목록 생성 실패' })
      }

      // 3) 기존 목록에서 삭제
      await fetch(`${TASKS_API}/lists/${fromListId}/tasks/${id}`, {
        method: 'DELETE',
        headers,
      })

      return res.json({ ok: true, newId: created.id })
    }

    return res.status(400).json({ error: '알 수 없는 액션입니다.' })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ error: e.message })
  }
}