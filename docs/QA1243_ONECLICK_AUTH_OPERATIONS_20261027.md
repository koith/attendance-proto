# QA1243 — 정상 메일 버튼으로 1호점 개통

- v0.366 Pages 배포 성공: `5cd40f7ba55d5bcb052203523300c1aefdf4629d`
- 운영 Auth 복구 메일 양식은 아직 미적용: `RECOVERY_AUTH_WRITE_CREDENTIAL_ABSENT`.
- 새 메일은 Auth 템플릿 적용 및 재조회가 성공한 뒤에만 한 번 발송.
- 기존 `production` 보호 환경이 존재하고 접근 가능한 경우에만 기존 쓰기 권한을 확인한다. 새 환경 생성/보안 정책 우회 금지.
- `webuielf@gmail.com`의 1호점 개통은 실제 비밀번호 설정, 로그인, 권한/매장 상태 확인 전까지 미완료.
