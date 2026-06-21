# 주간 플래너 — 구글 캘린더 할일 연동

구글 Tasks와 연동되는 주간 플래너입니다. Vercel로 배포해서 Notion에 임베딩할 수 있습니다.

---

## 배포 순서

### 1단계 — Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 (예: `weekly-planner`)
3. 좌측 메뉴 → **API 및 서비스** → **라이브러리**
4. `Google Tasks API` 검색 후 **사용 설정**
5. 좌측 메뉴 → **OAuth 동의 화면**
   - User Type: **외부** 선택
   - 앱 이름, 이메일 입력 후 저장
   - 범위 추가: `../auth/tasks`
   - 테스트 사용자에 본인 구글 계정 추가
6. 좌측 메뉴 → **사용자 인증 정보** → **사용자 인증 정보 만들기** → **OAuth 2.0 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI 추가:
     - `http://localhost:3000/api/auth/callback/google` (개발용)
     - `https://your-app.vercel.app/api/auth/callback/google` (배포 후 추가)
7. 클라이언트 ID와 시크릿 복사

### 2단계 — 로컬 테스트 (선택사항)

```bash
npm install
# .env.local 파일에 발급받은 키 입력
npm run dev
# http://localhost:3000 접속
```

### 3단계 — GitHub 업로드

```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/YOUR_ID/weekly-planner.git
git push -u origin main
```

### 4단계 — Vercel 배포

1. [vercel.com](https://vercel.com) 접속 → GitHub 연결
2. weekly-planner 레포 Import
3. **Environment Variables** 추가:
   | Key | Value |
   |-----|-------|
   | `GOOGLE_CLIENT_ID` | Google Cloud에서 복사한 클라이언트 ID |
   | `GOOGLE_CLIENT_SECRET` | Google Cloud에서 복사한 시크릿 |
   | `NEXTAUTH_SECRET` | 랜덤 문자열 (터미널에서 `openssl rand -base64 32`) |
   | `NEXTAUTH_URL` | `https://your-app.vercel.app` (배포 후 실제 URL) |
4. **Deploy** 클릭

### 5단계 — Google Cloud 리디렉션 URI 추가

배포 완료 후 Vercel에서 받은 URL을 Google Cloud Console의 OAuth 클라이언트에 추가:
- `https://your-app.vercel.app/api/auth/callback/google`

### 6단계 — Notion 임베딩

1. Notion 페이지에서 `/embed` 입력
2. Vercel URL 붙여넣기
3. 완료!

---

## 파일 구조

```
weekly-planner/
├── pages/
│   ├── _app.js              # SessionProvider 설정
│   ├── index.js             # 플래너 메인 UI
│   └── api/
│       ├── auth/
│       │   └── [...nextauth].js  # Google OAuth
│       └── tasks.js         # Google Tasks API
├── .env.local               # 환경변수 (git에 올리지 말 것)
├── .gitignore
├── next.config.js
└── package.json
```

---

## 기능

- 구글 계정으로 로그인
- 주간 뷰 (월~일), 이전/다음 주 이동
- 할일 추가 → 구글 Tasks에 저장
- 체크박스로 완료 처리
- X 버튼으로 삭제
- 반응형 레이아웃 (모바일 대응)
