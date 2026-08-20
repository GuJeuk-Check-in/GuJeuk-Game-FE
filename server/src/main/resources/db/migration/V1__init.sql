CREATE TABLE member (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(20) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL,
    rating INT NOT NULL DEFAULT 1200,
    wins INT NOT NULL DEFAULT 0,
    losses INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL
);

-- 랭킹은 레이팅 내림차순 조회가 전부다.
CREATE INDEX idx_member_rating ON member (rating DESC);

CREATE TABLE game_record (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    winner_id BIGINT NOT NULL,
    loser_id BIGINT NOT NULL,
    winner_rating_before INT NOT NULL,
    loser_rating_before INT NOT NULL,
    rating_delta INT NOT NULL,
    -- 정상 종료인지 몰수패인지 구분한다. 몰수패가 잦은 계정을 나중에 볼 수 있게.
    end_reason VARCHAR(20) NOT NULL,
    played_at DATETIME NOT NULL,
    CONSTRAINT fk_record_winner FOREIGN KEY (winner_id) REFERENCES member (id),
    CONSTRAINT fk_record_loser FOREIGN KEY (loser_id) REFERENCES member (id)
);

CREATE INDEX idx_record_played_at ON game_record (played_at DESC);
