# 서버 배포

프론트는 Vercel, 서버는 EC2(`3.37.79.125`)로 간다. 체크인 서버가 이미 쓰는
인스턴스에 얹는다.

```
EC2
├─ 8080  체크인 prod      aws-api.oijwef098234.com
├─ 8081  체크인 stag      aws-stag.oijwef098234.com
├─ 8090  monitor-bot     (내부)
└─ 8095  게임 서버        game-api.oijwef098234.com   ← 이 문서
```

## MySQL을 새로 띄우지 않는 이유

이 호스트는 3.8GB 중 여유가 700MB 남짓이고 **스왑이 없다.** MySQL 컨테이너
하나가 ~460MB를 쓰므로 하나 더 올리면 체크인 prod 앱이 OOM으로 죽는다.

그래서 체크인 prod MySQL 안에 별도 DB와 계정을 만들어 쓴다.

```
데이터베이스  gujuck_game
계정         gameuser   (gujuck_game.* 권한만)
```

체크인 데이터(`gujeuk_prod`)에는 접근 권한이 없다. 다만 **MySQL 인스턴스는
공유**하므로 그쪽이 내려가면 게임도 같이 내려간다. 인스턴스를 키우면 그때
전용 MySQL로 분리하는 편이 낫다.

## 최초 1회 준비

### 1. DB와 계정 (완료됨)

```sql
CREATE DATABASE gujuck_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'gameuser'@'%' IDENTIFIED BY '<암호>';
GRANT ALL PRIVILEGES ON gujuck_game.* TO 'gameuser'@'%';
```

암호는 EC2의 `~/gujuck-game/db.pw` 에 있다.

### 2. GitHub 시크릿

| 이름 | 값 |
| --- | --- |
| `EC2_HOST` | `3.37.79.125` |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | 접속용 개인키 |
| `GAME_JWT_SECRET` | EC2 `~/gujuck-game/jwt.secret` 값 |
| `GAME_DB_PASSWORD` | EC2 `~/gujuck-game/db.pw` 값 |

변수(Variables):

| 이름 | 값 |
| --- | --- |
| `GAME_CORS_ORIGINS` | `https://alkkagi.oijwef098234.com,https://ttt.oijwef098234.com` |

앱을 새로 배포하면 그 도메인을 `GAME_CORS_ORIGINS` 에 **먼저** 넣는다(펫타운도
아직 들어 있지 않다). 빠지면 브라우저가 사전 요청 단계에서 막는데, 그 실패는
서버 로그에 남지 않아 원인을 찾는 데 오래 걸린다.

### 3. Cloudflare 레코드

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| A | `game-api` | `3.37.79.125` | 주황(켬) |

`aws-api`와 같은 방식이다.

### 4. Caddy (완료됨)

`~/gujeuk-aws/proxy/Caddyfile` 에 블록이 추가되어 있다. 바꾸면 반영해야 한다.

```bash
docker exec gujeuk-aws-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

## 이후 배포

`develop`에 `server/**` 변경이 푸시되면 자동으로 나간다. 수동 실행은
Actions → Deploy Server → Run workflow.

이미지 빌드 → GHCR 푸시 → EC2에서 pull → `docker compose up -d` 순이고,
로컬·공개 헬스체크를 모두 통과해야 성공으로 끝난다.

`.env`는 배포할 때마다 시크릿에서 다시 쓴다. 서버에 손으로 만들어 둘 것이
없어야 인스턴스를 갈아끼울 때 배포만으로 복구된다.

## 수동 확인

```bash
ssh ubuntu@3.37.79.125
cd ~/gujuck-game && docker compose logs --tail=50 app
curl -s http://127.0.0.1:8095/health
```
