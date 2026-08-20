package com.gujeuk.game.health;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 서버가 떠 있는지만 확인한다.
 *
 * 게임 도메인이 아직 없어 이 엔드포인트가 유일한 라우트다. 프론트에서
 * VITE_API_BASE 연결을 검증할 때 쓸 수 있게 인증 없이 열어 둔다.
 */
@RestController
public class HealthController {

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}
