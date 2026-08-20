package com.gujeuk.game.member.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name = "member")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String nickname;

    @Column(nullable = false, length = 100)
    private String password;

    @Column(nullable = false)
    private int rating;

    @Column(nullable = false)
    private int wins;

    @Column(nullable = false)
    private int losses;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Builder
    private Member(String nickname, String password) {
        this.nickname = nickname;
        this.password = password;
        this.rating = INITIAL_RATING;
        this.wins = 0;
        this.losses = 0;
        this.createdAt = LocalDateTime.now();
    }

    public static final int INITIAL_RATING = 1200;

    public int totalGames() {
        return wins + losses;
    }

    public void applyWin(int delta) {
        this.rating += delta;
        this.wins += 1;
    }

    public void applyLoss(int delta) {
        // 레이팅이 음수로 내려가면 랭킹이 이상해진다. 바닥을 둔다.
        this.rating = Math.max(100, this.rating - delta);
        this.losses += 1;
    }
}
