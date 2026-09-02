-- 펫타운 세이브. 한 회원이 펫 한 마리를 키운다.
--
-- 조회 조건이 될 값(name·level·exp·coins)만 컬럼으로 꺼내고, 인벤토리·가구
-- 배치·튜토리얼처럼 모양이 자주 바뀌는 것은 JSON에 둔다. 전부 JSON에 넣으면
-- "레벨 10 이상 사용자 수" 같은 것을 못 세고, 전부 컬럼으로 펴면 인벤토리에
-- 물건이 하나 늘 때마다 마이그레이션이 붙는다.

CREATE TABLE pet (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT NOT NULL,

    name VARCHAR(16) NOT NULL,
    level INT NOT NULL DEFAULT 1,
    exp INT NOT NULL DEFAULT 0,
    coins INT NOT NULL DEFAULT 0,

    -- 세이브 스키마 버전(PetSave.version). 서버는 해석하지 않고 보관만 한다.
    -- 여기서 알 수 없는 버전을 막으면 클라이언트를 새로 배포할 때마다 서버도
    -- 같이 배포해야 한다.
    save_version INT NOT NULL,

    -- 세이브 전체를 그대로 담는다. 위 컬럼들은 여기서 뽑아 채운 사본이다.
    state_json JSON NOT NULL,

    -- 마지막으로 서버에 반영된 시각이자 충돌 판정의 기준값이다.
    -- 밀리초까지 둔다. 초 단위면 같은 초에 일어난 두 저장이 같은 시각으로
    -- 보여서 나중 저장이 앞선 저장을 조용히 덮어쓴다.
    synced_at DATETIME(3) NOT NULL,

    -- 펫은 한 마리다. 여러 마리를 허용하면 "어느 펫을 이어받을지" 고르는
    -- 화면이 필요해진다. 동시에 올라온 두 요청 중 하나를 막는 역할도 한다.
    CONSTRAINT uk_pet_member UNIQUE (member_id),
    CONSTRAINT fk_pet_member FOREIGN KEY (member_id) REFERENCES member (id)
);
