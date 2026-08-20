package com.gujeuk.game.global.jwt;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "game.jwt")
@Getter
@Setter
public class JwtProperties {
    private String secret;
    private long expirationSeconds;
}
