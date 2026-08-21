package com.gujeuk.game.global.config;

import com.gujeuk.game.match.ws.GameWebSocketHandler;
import com.gujeuk.game.tictactoe.ws.TicTacToeWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {
    private final GameWebSocketHandler alkkagiHandler;
    private final TicTacToeWebSocketHandler ticTacToeHandler;

    /**
     * 게임마다 경로를 나눈다.
     *
     * 한 경로에 게임 종류를 실어 나눌 수도 있지만, 그러면 한쪽 프로토콜이 바뀔 때
     * 다른 쪽 핸들러까지 흔들린다. 게임이 독립 배포 단위인 것과 같은 이유다.
     */
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // 오리진 검사는 CORS 설정이 아니라 여기서 따로 한다. 소켓 핸드셰이크는
        // CORS 필터를 타지 않는다. 개발 편의를 위해 열어두고, 인증은 토큰으로 한다.
        registry.addHandler(alkkagiHandler, "/ws/game").setAllowedOriginPatterns("*");
        registry.addHandler(ticTacToeHandler, "/ws/tic-tac-toe").setAllowedOriginPatterns("*");
    }
}
