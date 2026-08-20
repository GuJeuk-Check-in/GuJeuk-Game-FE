package com.gujeuk.game.global.jwt;

import com.gujeuk.game.global.error.GameException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
@RequiredArgsConstructor
public class JwtTokenProvider {
    private final JwtProperties properties;

    private SecretKey key() {
        return Keys.hmacShaKeyFor(properties.getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String create(Long memberId, String nickname) {
        Date now = new Date();

        return Jwts.builder()
                .subject(String.valueOf(memberId))
                .claim("nickname", nickname)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + properties.getExpirationSeconds() * 1000))
                .signWith(key())
                .compact();
    }

    /** 토큰이 유효하지 않으면 401로 던진다. WebSocket 핸드셰이크에서도 같은 경로를 쓴다. */
    public Long parseMemberId(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key())
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            return Long.valueOf(claims.getSubject());
        } catch (Exception exception) {
            throw GameException.unauthorized("유효하지 않은 토큰입니다.");
        }
    }
}
