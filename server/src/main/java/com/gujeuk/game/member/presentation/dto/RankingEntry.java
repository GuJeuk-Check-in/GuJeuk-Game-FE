package com.gujeuk.game.member.presentation.dto;

import com.gujeuk.game.member.domain.Member;

public record RankingEntry(int rank, String nickname, int rating, int wins, int losses) {
    public static RankingEntry of(int rank, Member member) {
        return new RankingEntry(
                rank,
                member.getNickname(),
                member.getRating(),
                member.getWins(),
                member.getLosses()
        );
    }
}
