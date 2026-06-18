# 구즉 펫 타운 — 로그인 API 명세서

## 배경 및 목적

현재 펫 게임 로그인은 이름과 전화번호만 입력하면 누구나 진입할 수 있는 구조입니다.  
이를 개선하여 **구즉 체크인 회원 목록**에 등록된 사용자만 로그인할 수 있도록 서버 검증을 추가합니다.

---

## API 공통 사항

| 항목 | 내용 |
|---|---|
| Base URL | `https://api.gujuk.com` (예시, 실제 URL로 변경) |
| Content-Type | `application/json` |
| 인증 | 불필요 (공개 엔드포인트) |

---

## 엔드포인트

### `POST /api/pet-game/login`

이름과 전화번호를 받아 **회원 목록 → 방문 기록** 순서로 조회 후 로그인 처리합니다.

#### Request

```http
POST /api/pet-game/login
Content-Type: application/json
```

```json
{
  "name": "홍길동",
  "phone": "010-1234-5678"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `name` | string | ✅ | 입력한 이름 (최대 10자) |
| `phone` | string | ✅ | 전화번호 (`010-XXXX-XXXX` 형식 또는 숫자만도 허용) |

---

#### Response — 성공

```json
{
  "success": true,
  "userId": "m_1234",
  "name": "홍길동",
  "phone": "010-1234-5678"
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `success` | boolean | 항상 `true` |
| `userId` | string | 사용자 고유 ID (펫 데이터 키로 사용) |
| `name` | string | DB에 저장된 실제 이름 |
| `phone` | string | DB에 저장된 전화번호 |

---

#### Response — 실패 (해당 사용자 없음)

HTTP Status: `404`

```json
{
  "success": false,
  "error": "USER_NOT_FOUND",
  "message": "회원 목록 및 방문 기록에서 찾을 수 없습니다."
}
```

#### Response — 실패 (필수 필드 누락 또는 형식 오류)

HTTP Status: `400`

```json
{
  "success": false,
  "error": "INVALID_INPUT",
  "message": "이름과 전화번호를 올바르게 입력해주세요."
}
```

#### Response — 실패 (서버 오류)

HTTP Status: `500`

```json
{
  "success": false,
  "error": "SERVER_ERROR",
  "message": "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
}
```

---

## 조회 로직 (백엔드 구현 가이드)

```
1. phone 정규화: 숫자만 추출 (010-1234-5678 → 01012345678)

2. 회원 목록(members) 조회
   WHERE phone = '01012345678' AND name = '홍길동'
   → 일치하면 즉시 반환

3. 없으면 404 반환
```

> **이름 매칭**: 공백 제거 후 비교 권장 (`홍 길동` → `홍길동`)  
> **전화번호 매칭**: 숫자만 추출 후 비교 (`010-1234-5678` → `01012345678`)

---

## 에러 코드 목록

| 코드 | HTTP Status | 설명 |
|---|---|---|
| `USER_NOT_FOUND` | 404 | 회원 목록, 방문 기록 모두에서 찾을 수 없음 |
| `INVALID_INPUT` | 400 | name 또는 phone 누락, 형식 오류 |
| `SERVER_ERROR` | 500 | 서버 내부 오류 |

---

## 프론트엔드 연동 포인트

현재 [`apps/pet-game/src/game/PetGame.ts`](../apps/pet-game/src/game/PetGame.ts) 의 로그인 버튼 핸들러 (323번째 줄 근처):

```typescript
// 현재 코드 (localStorage만 사용)
$('loginBtn').addEventListener('click', () => {
  if(!state) state = ensure({})
  state.nick = nickEl.value.trim()
  state.phone = phoneEl.value.trim()
  if(state.species) { saveSoon(); startGame() }
  else { buildPicks(); showScreen('s-select') }
})
```

```typescript
// API 연동 후 변경 예시
$('loginBtn').addEventListener('click', async () => {
  const name = nickEl.value.trim()
  const phone = phoneEl.value.trim()

  try {
    const res = await fetch('https://api.gujuk.com/api/pet-game/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    })
    const data = await res.json()

    if (!data.success) {
      // 에러 메시지 표시 (회원 목록/방문 기록에 없음)
      toast(data.message)
      return
    }

    // 로그인 성공 — userId를 로컬 키로 활용
    if (!state) state = ensure({})
    state.nick = data.name
    state.phone = data.phone
    state.userId = data.userId   // 서버에서 받은 ID 저장

    if (state.species) { saveSoon(); startGame() }
    else { buildPicks(); showScreen('s-select') }

  } catch (_) {
    toast('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.')
  }
})
```

---

## 참고 사항

- `userId`는 펫 데이터 저장 키(`gujuk_proto_v2`)와 연결하거나 서버 저장으로 마이그레이션할 때 사용 예정
- 전화번호는 숫자 9자리 이상부터 허용 권장 (일부 구형 번호 대응)
