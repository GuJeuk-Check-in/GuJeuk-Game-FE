-- 레이팅과 전적을 게임별로 나눈다.
--
-- 게임이 알까기 하나뿐일 때는 member 테이블에 rating/wins/losses를 직접 두는
-- 것으로 충분했다. 게임이 늘어나면 서로 다른 실력이 한 숫자에 섞여서, 어느
-- 쪽 실력인지 알 수 없는 값이 된다.

CREATE TABLE member_game_stat (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT NOT NULL,
    game VARCHAR(20) NOT NULL,
    rating INT NOT NULL DEFAULT 1200,
    wins INT NOT NULL DEFAULT 0,
    losses INT NOT NULL DEFAULT 0,
    CONSTRAINT uk_member_game UNIQUE (member_id, game),
    CONSTRAINT fk_stat_member FOREIGN KEY (member_id) REFERENCES member (id)
);

-- 랭킹은 "게임 하나를 골라 레이팅 내림차순"이 전부다.
CREATE INDEX idx_stat_game_rating ON member_game_stat (game, rating DESC);

-- 지금까지 쌓인 전적은 전부 알까기 것이다. 그대로 옮긴다.
INSERT INTO member_game_stat (member_id, game, rating, wins, losses)
SELECT id, 'ALKKAGI', rating, wins, losses FROM member;

-- 기존 대국 기록도 전부 알까기 것이다. 채워 넣은 뒤 기본값은 없앤다 --
-- 기본값을 남겨두면 게임을 지정하지 않은 코드가 조용히 알까기로 기록된다.
ALTER TABLE game_record ADD COLUMN game VARCHAR(20) NOT NULL DEFAULT 'ALKKAGI';
ALTER TABLE game_record ALTER COLUMN game DROP DEFAULT;

CREATE INDEX idx_record_game_played_at ON game_record (game, played_at DESC);

-- member에는 "누구인가"만 남긴다.
DROP INDEX idx_member_rating ON member;
ALTER TABLE member
    DROP COLUMN rating,
    DROP COLUMN wins,
    DROP COLUMN losses;
