import { getServerSession } from 'next-auth'
import { authOptions } from './auth/[...nextauth]'

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1'

// 날짜(YYYY-MM-DD) → RFC3339 due date (Google Tasks 형식)
const toRFC3339 = (dateStr) => `${dateStr}T00:00:00.000Z`

// RFC3339 → YYYY-MM-DD
const fromRFC3339 = (rfc) => rfc?.slice(0, 10)

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session?.accessToken) {
    return res.status(401).json({ error: '로그인이 필요합니다.' })
  }

  const token = session.accessToken
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // 기본 태스크 목록 ID 가져오기
  const getListId = async () => {
    const r = await fetch(`${TASKS_API}/users/@me/lists`, { headers })
    const data = await r.json()
    return data.items?.[0]?.id
  }

  try {
    const { action } = req.body || req.query

    // 목록(Task List) 전체 조회
    if (action === 'getLists') {
      const r = await fetch(`${TASKS_API}/users/@me/lists`, { headers })
      const data = await r.json()
      const lists = (data.items || []).map((l) => ({ id: l.id, title: l.title }))
      return res.json({ lists })
    }

    // 주간 할일 목록 조회
    if (action === 'list') {
      const { weekStart, listId: reqListId } = req.body
      const listId = reqListId || await getListId()

      const startDate = weekStart
      const endDateObj = new Date(weekStart)
      endDateObj.setDate(endDateObj.getDate() + 6)
      const endDate = fromRFC3339(endDateObj.toISOString())

      const url = new URL(`${TASKS_API}/lists/${listId}/tasks`)
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
    if (action === 'add') {
      const { date, title, listId: reqListId } = req.body
      const listId = reqListId || await getListId()

      const r = await fetch(`${TASKS_API}/lists/${listId}/tasks`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title,
          due: toRFC3339(date),
          status: 'needsAction',
        }),
      })
      const data = await r.json()
      return res.json({ id: data.id })
    }

    // 완료 토글
    if (action === 'toggle') {
      const { id, done, listId: reqListId } = req.body
      const listId = reqListId || await getListId()

      const r = await fetch(`${TASKS_API}/lists/${listId}/tasks/${id}`, {
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
      const { id, listId: reqListId } = req.body
      const listId = reqListId || await getListId()

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
