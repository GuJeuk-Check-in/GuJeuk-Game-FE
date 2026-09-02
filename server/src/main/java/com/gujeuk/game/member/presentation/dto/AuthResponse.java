package com.gujeuk.game.member.presentation.dto;

import com.gujeuk.game.member.domain.Member;

/**
 * 가입·로그인 응답.
 *
 * 신원만 담는다. 레이팅과 전적은 게임마다 다르므로 여기에 하나만 실을 수 없다.
 * 각 게임은 접속 후 자기 소켓의 READY 메시지나 /ranking 으로 자기 게임의
 * 숫자를 받는다.
 *
 * <p>{@code memberId}는 펫타운 때문에 있다. 그 게임은 세이브를 브라우저에
 * 캐시하는데, 기관에서 한 기기를 여러 사람이 번갈아 쓰므로 저장 키에 누구
 * 것인지를 적어야 한다({@code gj.pet.v1.<memberId>}). 칸이 하나면 다음 사람이
 * 앞사람의 펫을 덮어쓴다.
 *
 * <p>닉네임으로 대신하지 않는 이유: 지금은 유일하지만 그것은 제약 하나에
 * 기대는 것이고, 서버가 회원을 정하는 값은 언제나 토큰의 subject인
 * memberId다. 두 값을 쓰면 로컬 키와 서버 행이 서로 다른 것을 기준으로 갈린다.
 */
public record AuthResponse(String token, Long memberId, String nickname) {
    public static AuthResponse of(String token, Member member) {
        return new AuthResponse(token, member.getId(), member.getNickname());
    }
}
