package com.gujeuk.game.member.presentation.dto;

import com.gujeuk.game.member.domain.Member;

/**
 * 가입·로그인 응답.
 *
 * 신원만 담는다. 레이팅과 전적은 게임마다 다르므로 여기에 하나만 실을 수 없다.
 * 각 게임은 접속 후 자기 소켓의 READY 메시지나 /ranking 으로 자기 게임의
 * 숫자를 받는다.
 */
public record AuthResponse(String token, String nickname) {
    public static AuthResponse of(String token, Member member) {
        return new AuthResponse(token, member.getNickname());
    }
}
