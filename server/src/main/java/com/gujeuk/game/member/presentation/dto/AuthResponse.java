package com.gujeuk.game.member.presentation.dto;

import com.gujeuk.game.member.domain.Member;

public record AuthResponse(String token, String nickname, int rating, int wins, int losses) {
    public static AuthResponse of(String token, Member member) {
        return new AuthResponse(
                token,
                member.getNickname(),
                member.getRating(),
                member.getWins(),
                member.getLosses()
        );
    }
}
