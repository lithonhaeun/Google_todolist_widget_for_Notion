import { useEffect, useState } from 'react'

export default function Connected() {
  const [status, setStatus] = useState('토큰을 가져오는 중...')
  const [tokenData, setTokenData] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/get-token')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setStatus('로그인이 필요합니다. 이 탭을 닫고 다시 시도해주세요.')
          return
        }
        const payload = btoa(JSON.stringify(data))
        setTokenData(payload)
        setStatus('연결 완료!')

        // 1) 부모 창(위젯)에 postMessage로 토큰 전달
        try {
          if (window.opener) {
            window.opener.postMessage({ type: 'GTASK_TOKEN', payload }, '*')
          }
        } catch (e) {}

        // 2) localStorage에도 저장 (같은 origin이면 위젯이 읽을 수 있음)
        try {
          localStorage.setItem('gtask_token', payload)
        } catch (e) {}
      })
      .catch(() => setStatus('오류가 발생했습니다.'))
  }, [])

  const copyCode = () => {
    if (!tokenData) return
    navigator.clipboard.writeText(tokenData)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.title}>{status}</div>
        {tokenData && (
          <>
            <div style={styles.sub}>
              이 탭을 닫으면 위젯에 자동으로 연결됩니다.<br />
              자동 연결이 안 되면 아래 코드를 복사해<br />위젯의 입력란에 붙여넣으세요.
            </div>
            <textarea style={styles.code} readOnly value={tokenData} />
            <button style={styles.btn} onClick={copyCode}>
              {copied ? '복사됨!' : '코드 복사'}
            </button>
            <button style={styles.closeBtn} onClick={() => window.close()}>
              탭 닫기
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fafafa', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: 20 },
  card: { background: '#fff', border: '0.5px solid #eee', borderRadius: 12, padding: '2.5rem 2rem', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)', maxWidth: 400, width: '100%' },
  title: { fontSize: 20, fontWeight: 600, color: '#333', marginBottom: 12 },
  sub: { fontSize: 12, color: '#999', marginBottom: 20, lineHeight: 1.6 },
  code: { width: '100%', height: 80, fontSize: 10, padding: 8, border: '0.5px solid #ddd', borderRadius: 6, resize: 'none', color: '#666', marginBottom: 12, wordBreak: 'break-all' },
  btn: { background: '#FFB6C1', border: 'none', color: '#fff', borderRadius: 8, padding: '10px 20px', fontSize: 13, cursor: 'pointer', width: '100%', fontWeight: 500, marginBottom: 8 },
  closeBtn: { background: '#fff', border: '0.5px solid #ddd', color: '#888', borderRadius: 8, padding: '9px 20px', fontSize: 12, cursor: 'pointer', width: '100%' },
}
