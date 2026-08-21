package com.gujeuk.game.match.service;

import com.gujeuk.game.member.domain.EndReason;
import com.gujeuk.game.member.domain.GameRecord;
import com.gujeuk.game.member.domain.GameRecordRepository;
import com.gujeuk.game.member.domain.GameType;
import com.gujeuk.game.member.domain.MemberGameStat;
import com.gujeuk.game.member.service.MemberGameStatService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MatchResultService {
    private final GameRecordRepository gameRecordRepository;
    private final MemberGameStatService statService;
    private final RatingService ratingService;

    /**
     * 대국 결과를 반영하고, 승자 기준 레이팅 변동량을 돌려준다.
     *
     * 레이팅은 게임별로 따로 움직인다. 같은 사람이 알까기에서 이기고 틱택토에서
     * 져도 두 숫자는 서로를 건드리지 않는다.
     */
    @Transactional
    public Result apply(GameType game, Long winnerId, Long loserId, EndReason reason) {
        MemberGameStat winner = statService.getOrCreate(winnerId, game);
        MemberGameStat loser = statService.getOrCreate(loserId, game);

        int winnerBefore = winner.getRating();
        int loserBefore = loser.getRating();
        int delta = ratingService.delta(winner, loser);

        winner.applyWin(delta);
        loser.applyLoss(delta);

        gameRecordRepository.save(GameRecord.builder()
                .game(game)
                .winnerId(winnerId)
                .loserId(loserId)
                .winnerRatingBefore(winnerBefore)
                .loserRatingBefore(loserBefore)
                .ratingDelta(delta)
                .endReason(reason)
                .build());

        return new Result(delta, winner.getRating(), loser.getRating());
    }

    public record Result(int delta, int winnerRating, int loserRating) {
    }
}
