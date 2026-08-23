package com.gujeuk.game.member.presentation.dto;

import com.gujeuk.game.member.domain.RankingRow;

public record RankingEntry(int rank, String nickname, int rating, int wins, int losses) {
    public static RankingEntry of(int rank, RankingRow row) {
        return new RankingEntry(rank, row.nickname(), row.rating(), row.wins(), row.losses());
    }
}
