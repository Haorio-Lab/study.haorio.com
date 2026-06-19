# ITPE Flash NAS API

Supabase 로그인 토큰을 검증하고 ITPE Flash 카드 데이터를 NAS PostgreSQL에 저장하는
FastAPI 서비스입니다. Supabase 서비스 키는 사용하지 않습니다.

## 데이터 계약

- `GET /v1/data`: 로그인 사용자의 `{version, notes, statuses, updatedAt}` 조회
- `PUT /v1/data`: 동일한 카드 구조를 upsert
- `GET /healthz`: 프로세스 상태
- `GET /readyz`: PostgreSQL 연결 상태

`PUT /v1/data`는 요청에서 누락된 카드나 상태 행을 삭제하지 않습니다. 사용자가 앱에서
삭제한 카드는 기존 구조대로 `deleted: true`로 저장됩니다.

## 환경변수

`.env.example`을 기준으로 NAS 관리자가 실제 비밀번호를 별도 `.env`에 설정합니다.

```dotenv
DATABASE_URL=postgresql://henryhoy:<PASSWORD>@postgres-personal:5432/haoriodb
SUPABASE_URL=https://svrvckvuwwucrynyqvqk.supabase.co
SUPABASE_JWT_AUDIENCE=authenticated
ITPEFLASH_ALLOWED_ORIGINS=https://itpeflash.haorio.com
```

DB 호스트 `postgres-personal`을 해석할 수 있도록 API 컨테이너를 PostgreSQL과 같은
Docker 네트워크에 연결해야 합니다.

## 이미지 빌드

이 README가 있는 디렉터리에서 실행합니다.

```bash
docker build -t itpeflash-api:1.0 .
```

## 마이그레이션과 초기 적재

마이그레이션은 실행 전에 기존 테이블 목록을 출력합니다. `itpeflash_` 테이블만 만들며
`DROP`, `DELETE`, `TRUNCATE`를 실행하지 않습니다.

정의 삑삑이와 주모 삑삑이 원본은 `seed/definition.js`, `seed/jumo.js`에 포함되어
있으며 Docker 이미지에도 복사됩니다. NAS 관리자는 별도 저장소나 Obsidian 볼륨을
마운트할 필요가 없습니다.

Docker 네트워크 이름을 NAS 환경에 맞춰 실행합니다.

```bash
docker run --rm \
  --network <POSTGRES_DOCKER_NETWORK> \
  --env-file /volume1/docker/itpeflash-api/.env \
  itpeflash-api:1.0 \
  python -m scripts.migrate
```

기본 대상은 Supabase 사용자 `jw_hoy@naver.com`과 사용자 ID
`c152558c-dc3e-4ce3-872f-c9958db33b37`입니다. 다른 계정을 적재할 때만
`--target-user-id`와 `--target-email`을 함께 지정합니다.

DB 연결 없이 원본 변환과 건수만 검증할 수 있습니다.

```bash
python -m scripts.migrate --dry-run
```

정상 건수는 기존 카드 1개, 정의 삑삑이 1,350개, 주모 삑삑이 292개로 총
1,643개입니다. 재실행 시 사용자가 수정하지 않은 가져오기 카드만 원본 변경분으로
갱신하고 사용자 카드와 사용자 수정 카드는 보존합니다.

## API 실행

```bash
docker run -d \
  --name itpeflash-api \
  --restart unless-stopped \
  --network <POSTGRES_DOCKER_NETWORK> \
  --env-file /volume1/docker/itpeflash-api/.env \
  -p 18080:8000 \
  itpeflash-api:1.0
```

DSM 역방향 프록시는 `https://itpeflash-api.haorio.com`을
`http://127.0.0.1:18080`으로 전달하면 됩니다.
