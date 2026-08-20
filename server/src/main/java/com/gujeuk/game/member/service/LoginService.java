package com.gujeuk.game.member.service;

import com.gujeuk.game.global.error.GameException;
import com.gujeuk.game.global.jwt.JwtTokenProvider;
import com.gujeuk.game.member.domain.Member;
import com.gujeuk.game.member.domain.MemberRepository;
import com.gujeuk.game.member.presentation.dto.AuthRequest;
import com.gujeuk.game.member.presentation.dto.AuthResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class LoginService {
    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    @Transactional(readOnly = true)
    public AuthResponse execute(AuthRequest request) {
        Member member = memberRepository.findByNickname(request.nickname())
                .orElseThrow(() -> GameException.unauthorized("닉네임 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(request.password(), member.getPassword())) {
            // 어느 쪽이 틀렸는지 알려주면 닉네임 존재 여부가 새어나간다.
            throw GameException.unauthorized("닉네임 또는 비밀번호가 올바르지 않습니다.");
        }

        return AuthResponse.of(tokenProvider.create(member.getId(), member.getNickname()), member);
    }
}
