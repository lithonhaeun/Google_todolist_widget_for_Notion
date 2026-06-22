import { getToken } from 'next-auth/jwt'

// 로그인된 세션(쿠키)에서 Google 토큰을 추출해 반환
// 새 탭에서 로그인 후 이 토큰을 위젯에 전달하는 용도
export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  if (!token?.accessToken) {
    return res.status(401).json({ error: '로그인되지 않았습니다.' })
  }

  return res.json({
    accessToken: token.accessToken,
    refreshToken: token.refreshToken || null,
  })
}
