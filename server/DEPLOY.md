# 서버 배포

프론트는 Vercel, 서버는 EC2로 간다. 체크인 서버가 이미 쓰고 있는 인스턴스에
포트와 DB를 분리해 얹는다.

```
EC2
├─ 8080  체크인 prod      aws-api.oijwef098234.com
├─ 8081  체크인 stag      aws-stag.oijwef098234.com
└─ 8090  게임 서버        game-api.oijwef098234.com   ← 이 문서
```

MySQL도 체크인 것과 따로 쓴다(`gujuck-game-mysql`). 도메인도 데이터도 겹치지 않는다.

## 최초 1회 준비

### 1. GitHub 시크릿

`Settings → Secrets and variables → Actions`

| 이름 | 값 |
| --- | --- |
| `EC2_HOST` | 체크인 서버 레포에 있는 값과 동일 |
| `EC2_USER` | 〃 |
| `EC2_SSH_KEY` | 〃 |
| `GAME_JWT_SECRET` | 32자 이상 임의 문자열 |
| `GAME_MYSQL_PASSWORD` | 임의 문자열 |
| `GAME_MYSQL_ROOT_PASSWORD` | 임의 문자열 |

변수(Variables) 탭에도 하나 넣는다.

| 이름 | 값 |
| --- | --- |
| `GAME_CORS_ORIGINS` | `https://alkkagi.oijwef098234.com,https://ttt.oijwef098234.com` |

### 2. Cloudflare 레코드

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `game-api` | EC2 (`aws-api`와 같은 대상) | 주황(프록시 켬) |

`aws-api`·`aws-stag`와 같은 방식이다. 인증서는 Caddy가 받는다.

### 3. EC2 Caddy

체크인 서버 레포 `ops/aws/Caddyfile`에 블록이 추가되어 있다. EC2에 반영한다.

```bash
# EC2에서
cd ~/gujeuk-aws          # Caddyfile 위치
docker exec gujeuk-aws-caddy caddy reload --config /etc/caddy/Caddyfile
```

## 이후 배포

`develop`에 `server/**` 변경이 푸시되면 자동으로 나간다. 수동 실행은
Actions → Deploy Server → Run workflow.

배포는 이미지 빌드 → GHCR 푸시 → EC2에서 pull → `docker compose up -d` 순이고,
로컬 헬스체크(120초)와 공개 헬스체크(120초)를 모두 통과해야 성공으로 끝난다.

`.env`는 배포할 때마다 시크릿에서 다시 쓴다. 서버에 손으로 만들어 둘 것이
없어야 인스턴스를 갈아끼울 때 배포만으로 복구된다.
