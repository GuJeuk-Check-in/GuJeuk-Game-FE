package com.gujeuk.game.global.config;

import com.gujeuk.game.match.ws.GameWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {
    private final GameWebSocketHandler handler;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // 오리진 검사는 CORS 설정이 아니라 여기서 따로 한다. 소켓 핸드셰이크는
        // CORS 필터를 타지 않는다. 개발 편의를 위해 열어두고, 인증은 토큰으로 한다.
        registry.addHandler(handler, "/ws/game").setAllowedOriginPatterns("*");
    }
}
