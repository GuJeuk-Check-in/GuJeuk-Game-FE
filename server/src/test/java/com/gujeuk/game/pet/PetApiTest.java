package com.gujeuk.game.pet;

import com.gujeuk.game.global.jwt.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 경로가 실제로 인증 뒤에 있는지, 그리고 주인이 토큰으로만 정해지는지 본다.
 *
 * 서비스 테스트만으로는 이것을 보지 못한다. permitAll 목록에 /pet이 잘못
 * 들어가는 실수는 서비스가 아니라 설정에서 일어난다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PetApiTest {

    private static final String SAVE = """
            {
              "version": 1,
              "pet": { "name": "몰랑", "bornAt": 1788000000000, "level": 3, "exp": 40 },
              "stats": { "hunger": 72.5, "mood": 88, "clean": 61, "energy": 94 },
              "wallet": { "coins": 230 },
              "inventory": {},
              "room": { "wallpaper": "default", "floor": "default", "placed": [] },
              "sleep": null,
              "tutorial": { "step": 7, "done": true },
              "daily": { "date": "2026-09-02", "coinsEarned": 120, "checkedIn": true },
              "lastSeenAt": 1788262698607
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider tokenProvider;

    /**
     * **401이어야 한다.** 스프링 시큐리티의 기본값은 403(본문 없음)이지만,
     * 프론트의 공용 클라이언트(packages/api 의 client.ts)는 401일 때만 토큰을
     * 지우고 로그인 화면으로 되돌린다. 403이 나가면 토큰이 만료된 사람은
     * 로그인하라는 말도 못 듣고 요청이 조용히 실패하는 것만 본다.
     *
     * 상태 코드와 본문을 정확히 못 박는다. 진입점을 바꾸면 펫만이 아니라 보호된
     * 경로 전부의 응답이 함께 바뀌므로, 그때는 이 테스트가 먼저 빨개져야 한다.
     */
    @Test
    void 토큰_없이는_아무것도_못_한다() throws Exception {
        mockMvc.perform(get("/pet"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").exists());
        mockMvc.perform(put("/pet").contentType(MediaType.APPLICATION_JSON).content(body(SAVE, null)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/pet")).andExpect(status().isUnauthorized());

        // 깨진 토큰도 익명과 같다. 통과시키면 아무 문자열로 남의 펫을 읽게 된다.
        mockMvc.perform(get("/pet").header("Authorization", "Bearer 아무거나"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 저장된_펫이_없으면_404다() throws Exception {
        mockMvc.perform(get("/pet").header("Authorization", bearer(11L)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("저장된 펫이 없습니다."));
    }

    @Test
    void 올리고_받고_지운다() throws Exception {
        mockMvc.perform(put("/pet")
                        .header("Authorization", bearer(12L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(SAVE, null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.syncedAt").isNumber());

        mockMvc.perform(get("/pet").header("Authorization", bearer(12L)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.save.pet.name").value("몰랑"))
                .andExpect(jsonPath("$.save.stats.hunger").value(72.5))
                .andExpect(jsonPath("$.syncedAt").isNumber());

        mockMvc.perform(delete("/pet").header("Authorization", bearer(12L)))
                .andExpect(status().isNoContent());

        // 멱등이다. 두 번째도 204.
        mockMvc.perform(delete("/pet").header("Authorization", bearer(12L)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/pet").header("Authorization", bearer(12L)))
                .andExpect(status().isNotFound());
    }

    @Test
    void 충돌이면_409에_서버_상태가_실린다() throws Exception {
        mockMvc.perform(put("/pet")
                        .header("Authorization", bearer(13L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(SAVE, null)))
                .andExpect(status().isOk());

        mockMvc.perform(put("/pet")
                        .header("Authorization", bearer(13L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(SAVE.replace("\"몰랑\"", "\"다른펫\""), null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("다른 기기에 더 최근 진행이 있습니다."))
                .andExpect(jsonPath("$.server.save.pet.name").value("몰랑"))
                .andExpect(jsonPath("$.server.syncedAt").isNumber());
    }

    @Test
    void 남의_토큰으로는_남의_펫이_보이지_않는다() throws Exception {
        mockMvc.perform(put("/pet")
                        .header("Authorization", bearer(14L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(SAVE, null)))
                .andExpect(status().isOk());

        // 다음 사람이 같은 기기에서 로그인했다. 앞사람의 펫이 보이면 안 된다.
        mockMvc.perform(get("/pet").header("Authorization", bearer(15L)))
                .andExpect(status().isNotFound());
    }

    @Test
    void 모양이_어긋난_세이브는_400이다() throws Exception {
        mockMvc.perform(put("/pet")
                        .header("Authorization", bearer(16L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"baseSyncedAt\": null}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("세이브 형식이 올바르지 않습니다."));

        // 본문이 JSON이 아니면 /error로 새어나가 403이 되지 않아야 한다.
        mockMvc.perform(put("/pet")
                        .header("Authorization", bearer(16L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("이건 JSON이 아니다"))
                .andExpect(status().isBadRequest());
    }

    private String bearer(long memberId) {
        return "Bearer " + tokenProvider.create(memberId, "회원" + memberId);
    }

    private String body(String save, Long baseSyncedAt) {
        return "{\"save\": %s, \"baseSyncedAt\": %s}".formatted(save, baseSyncedAt);
    }
}
