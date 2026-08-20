package com.gujeuk.game.match.service;

import com.gujeuk.game.member.domain.Member;
import org.springframework.stereotype.Service;

/**
 * Elo 레이팅.
 *
 * 체스에서 쓰는 그대로다. K는 판수가 적을 때 크게 움직이도록 두 단계만 둔다 —
 * 처음 몇 판에서 실력이 반영되기까지 오래 걸리면 신규 유저가 상위권과
 * 계속 만나면서 재미가 없어진다.
 */
@Service
public class RatingService {
    private static final int K_NEW = 32;
    private static final int K_ESTABLISHED = 16;
    private static final int ESTABLISHED_GAMES = 30;

    /** 이긴 쪽이 얻는 점수. 진 쪽은 같은 값을 잃는다(합이 보존된다). */
    public int delta(Member winner, Member loser) {
        double expected = expectedScore(winner.getRating(), loser.getRating());
        int k = Math.min(kFactor(winner), kFactor(loser));

        // 최소 1점은 움직여야 한다. 레이팅 차가 크면 반올림으로 0이 되어
        // 아무리 이겨도 점수가 안 오르는 구간이 생긴다.
        return Math.max(1, (int) Math.round(k * (1 - expected)));
    }

    private double expectedScore(int rating, int opponentRating) {
        return 1.0 / (1.0 + Math.pow(10, (opponentRating - rating) / 400.0));
    }

    private int kFactor(Member member) {
        return member.totalGames() < ESTABLISHED_GAMES ? K_NEW : K_ESTABLISHED;
    }
}
