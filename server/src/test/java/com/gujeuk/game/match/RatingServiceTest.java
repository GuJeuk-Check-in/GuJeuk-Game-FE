package com.gujeuk.game.match;

import com.gujeuk.game.match.service.RatingService;
import com.gujeuk.game.member.domain.Member;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RatingServiceTest {
    private final RatingService ratingService = new RatingService();

    private Member member(String nickname) {
        return Member.builder().nickname(nickname).password("x").build();
    }

    @Test
    void 실력이_같으면_K의_절반이_움직인다() {
        Member winner = member("a");
        Member loser = member("b");

        // 둘 다 1200, 기대승률 0.5, K=32 → 16
        assertThat(ratingService.delta(winner, loser)).isEqualTo(16);
    }

    @Test
    void 약자가_이기면_더_많이_얻는다() {
        Member underdog = member("under");
        Member favorite = member("fav");
        favorite.applyWin(300);

        int upset = ratingService.delta(underdog, favorite);
        int expected = ratingService.delta(favorite, underdog);

        assertThat(upset).isGreaterThan(expected);
    }

    @Test
    void 레이팅_차가_커도_최소_1점은_움직인다() {
        Member weak = member("weak");
        Member strong = member("strong");
        strong.applyWin(2000);

        assertThat(ratingService.delta(strong, weak)).isGreaterThanOrEqualTo(1);
    }

    @Test
    void 레이팅은_바닥_아래로_내려가지_않는다() {
        Member member = member("floor");
        member.applyLoss(5000);

        assertThat(member.getRating()).isEqualTo(100);
    }
}
