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

            // 검색 시작일 (월요일 00:00:00, 한국 표준시 기준 ISO 문자열 만들기)
            // 시차 문제를 예방하기 위해 구글 API가 지원하는 dueMin, dueMax 파라미터를 씁니다.
            const startIso = `${weekStart}T00:00:00+09:00` // 한국 시차(+09:00) 명시
            
            const endDateObj = new Date(weekStart)
            endDateObj.setDate(endDateObj.getDate() + 6)
            const endDate = fromRFC3339(endDateObj.toISOString())
            const endIso = `${endDate}T23:59:59+09:00`

            const url = new URL(`${TASKS_API}/lists/${listId}/tasks`)
            url.searchParams.set('showCompleted', 'true')
            url.searchParams.set('showHidden', 'true')
            // 구글 서버 단에서 이번 주 일정만 정확히 필터링해서 가져오도록 설정
            url.searchParams.set('dueMin', startIso)
            url.searchParams.set('dueMax', endIso)

            const r = await fetch(url.toString(), { headers })
            const data = await r.json()

            // 구글 API 응답 에러 확인용 로그 (콘솔에서 확인 가능)
            if (!r.ok) {
              console.error('Google API Error:', data)
              return res.status(r.status).json({ error: data.error?.message || '구글 API 오류' })
            }

            const tasks = (data.items || [])
              .map((t) => {
                // 구글에서 온 날짜(UTC or KST)를 한국 시간 기준으로 날짜 문자열(YYYY-MM-DD) 추출
                // 구글 tasks의 t.due는 대개 "2026-06-21T15:00:00.000Z" 형태로 오므로 Local 시간대로 변환 후 잘라야 정확합니다.
                const localDate = t.due ? new Date(t.due) : null
                let dateStr = ''
                if (localDate) {
                  const offset = localDate.getTimezoneOffset() * 60000;
                  const dateWithOffset = new Date(localDate.getTime() - offset);
                  dateStr = dateWithOffset.toISOString().slice(0, 10)
                }

                return {
                  id: t.id,
                  title: t.title,
                  done: t.status === 'completed',
                  date: dateStr,
                }
              })
              // 한 번 더 캘린더 날짜 범위에 맞게 안전하게 필터링
              .filter((t) => t.date >= weekStart && t.date <= endDate)

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
