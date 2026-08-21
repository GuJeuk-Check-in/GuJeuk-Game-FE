package com.gujeuk.game.member.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "game_record")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GameRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 어느 게임의 전적인지. 게임마다 레이팅이 따로라 기록도 나뉘어야 한다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "game", nullable = false, length = 20)
    private GameType game;

    @Column(name = "winner_id", nullable = false)
    private Long winnerId;

    @Column(name = "loser_id", nullable = false)
    private Long loserId;

    @Column(name = "winner_rating_before", nullable = false)
    private int winnerRatingBefore;

    @Column(name = "loser_rating_before", nullable = false)
    private int loserRatingBefore;

    @Column(name = "rating_delta", nullable = false)
    private int ratingDelta;

    @Enumerated(EnumType.STRING)
    @Column(name = "end_reason", nullable = false, length = 20)
    private EndReason endReason;

    @Column(name = "played_at", nullable = false)
    private LocalDateTime playedAt;

    @Builder
    private GameRecord(
            GameType game,
            Long winnerId,
            Long loserId,
            int winnerRatingBefore,
            int loserRatingBefore,
            int ratingDelta,
            EndReason endReason
    ) {
        this.game = game;
        this.winnerId = winnerId;
        this.loserId = loserId;
        this.winnerRatingBefore = winnerRatingBefore;
        this.loserRatingBefore = loserRatingBefore;
        this.ratingDelta = ratingDelta;
        this.endReason = endReason;
        this.playedAt = LocalDateTime.now();
    }
}
