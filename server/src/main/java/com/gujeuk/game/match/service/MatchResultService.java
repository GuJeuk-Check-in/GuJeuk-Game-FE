package com.gujeuk.game.match.service;

import com.gujeuk.game.member.domain.EndReason;
import com.gujeuk.game.member.domain.GameRecord;
import com.gujeuk.game.member.domain.GameRecordRepository;
import com.gujeuk.game.member.domain.Member;
import com.gujeuk.game.member.domain.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MatchResultService {
    private final MemberRepository memberRepository;
    private final GameRecordRepository gameRecordRepository;
    private final RatingService ratingService;

    /** 대국 결과를 반영하고, 승자 기준 레이팅 변동량을 돌려준다. */
    @Transactional
    public Result apply(Long winnerId, Long loserId, EndReason reason) {
        Member winner = memberRepository.findById(winnerId).orElseThrow();
        Member loser = memberRepository.findById(loserId).orElseThrow();

        int winnerBefore = winner.getRating();
        int loserBefore = loser.getRating();
        int delta = ratingService.delta(winner, loser);

        winner.applyWin(delta);
        loser.applyLoss(delta);

        gameRecordRepository.save(GameRecord.builder()
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
