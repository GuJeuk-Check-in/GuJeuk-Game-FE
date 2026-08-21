package com.gujeuk.game.member.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 회원 한 명의 게임 하나에 대한 전적.
 *
 * 예전에는 이 값들이 member 테이블에 직접 있었다. 게임이 알까기 하나뿐일 때는
 * 문제가 없었지만, 게임이 늘어나면 서로 다른 실력이 한 숫자에 섞인다.
 *
 * 행은 그 게임을 처음 할 때 만들어진다. 가입 시점에 모든 게임의 행을 미리
 * 만들면 게임을 추가할 때마다 기존 회원 전체를 훑는 마이그레이션이 필요해진다.
 */
@Entity
@Table(
        name = "member_game_stat",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_member_game",
                columnNames = {"member_id", "game"}
        )
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberGameStat {

    public static final int INITIAL_RATING = 1200;
    /** 레이팅이 음수로 내려가면 랭킹이 이상해진다. 바닥을 둔다. */
    private static final int RATING_FLOOR = 100;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Enumerated(EnumType.STRING)
    @Column(name = "game", nullable = false, length = 20)
    private GameType game;

    @Column(nullable = false)
    private int rating;

    @Column(nullable = false)
    private int wins;

    @Column(nullable = false)
    private int losses;

    private MemberGameStat(Long memberId, GameType game) {
        this.memberId = memberId;
        this.game = game;
        this.rating = INITIAL_RATING;
        this.wins = 0;
        this.losses = 0;
    }

    public static MemberGameStat start(Long memberId, GameType game) {
        return new MemberGameStat(memberId, game);
    }

    public int totalGames() {
        return wins + losses;
    }

    public void applyWin(int delta) {
        this.rating += delta;
        this.wins += 1;
    }

    public void applyLoss(int delta) {
        this.rating = Math.max(RATING_FLOOR, this.rating - delta);
        this.losses += 1;
    }
}
