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
public class SignUpService {
    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    @Transactional
    public AuthResponse execute(AuthRequest request) {
        if (memberRepository.existsByNickname(request.nickname())) {
            throw GameException.conflict("이미 사용 중인 닉네임입니다.");
        }

        Member member = memberRepository.save(Member.builder()
                .nickname(request.nickname())
                .password(passwordEncoder.encode(request.password()))
                .build());

        return AuthResponse.of(tokenProvider.create(member.getId(), member.getNickname()), member);
    }
}
