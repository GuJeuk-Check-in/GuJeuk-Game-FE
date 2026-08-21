package com.gujeuk.game.match;

import com.gujeuk.game.match.service.RatingService;
import com.gujeuk.game.member.domain.GameType;
import com.gujeuk.game.member.domain.MemberGameStat;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RatingServiceTest {
    private final RatingService ratingService = new RatingService();

    private MemberGameStat stat(long memberId) {
        return MemberGameStat.start(memberId, GameType.ALKKAGI);
    }

    @Test
    void 실력이_같으면_K의_절반이_움직인다() {
        MemberGameStat winner = stat(1L);
        MemberGameStat loser = stat(2L);

        // 둘 다 1200, 기대승률 0.5, K=32 → 16
        assertThat(ratingService.delta(winner, loser)).isEqualTo(16);
    }

    @Test
    void 약자가_이기면_더_많이_얻는다() {
        MemberGameStat underdog = stat(1L);
        MemberGameStat favorite = stat(2L);
        favorite.applyWin(300);

        int upset = ratingService.delta(underdog, favorite);
        int expected = ratingService.delta(favorite, underdog);

        assertThat(upset).isGreaterThan(expected);
    }

    @Test
    void 레이팅_차가_커도_최소_1점은_움직인다() {
        MemberGameStat weak = stat(1L);
        MemberGameStat strong = stat(2L);
        strong.applyWin(2000);

        assertThat(ratingService.delta(strong, weak)).isGreaterThanOrEqualTo(1);
    }

    @Test
    void 레이팅은_바닥_아래로_내려가지_않는다() {
        MemberGameStat stat = stat(1L);
        stat.applyLoss(5000);

        assertThat(stat.getRating()).isEqualTo(100);
    }

    @Test
    void 게임이_다르면_전적이_섞이지_않는다() {
        MemberGameStat alkkagi = MemberGameStat.start(1L, GameType.ALKKAGI);
        MemberGameStat ticTacToe = MemberGameStat.start(1L, GameType.TIC_TAC_TOE);

        alkkagi.applyWin(50);

        // 같은 회원이라도 게임이 다르면 서로를 건드리지 않는다.
        assertThat(alkkagi.getRating()).isEqualTo(MemberGameStat.INITIAL_RATING + 50);
        assertThat(ticTacToe.getRating()).isEqualTo(MemberGameStat.INITIAL_RATING);
        assertThat(ticTacToe.totalGames()).isZero();
    }
}
