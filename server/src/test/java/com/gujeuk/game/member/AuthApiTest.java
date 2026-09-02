package com.gujeuk.game.member;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gujeuk.game.global.jwt.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 가입·로그인 응답이 회원을 어떻게 알려주는지 본다.
 *
 * memberId가 토큰의 subject와 다르면, 펫타운의 로컬 저장 키
 * ({@code gj.pet.v1.<memberId>})와 서버 행이 서로 다른 회원을 가리키게 된다.
 * 한 기기를 여러 사람이 쓰는 환경에서 그것은 남의 펫을 보여주는 결함이다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AuthApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenProvider tokenProvider;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 가입_응답의_memberId는_토큰의_주인과_같다() throws Exception {
        JsonNode body = signUp("펫주인", "1234");

        long memberId = body.get("memberId").asLong();
        String token = body.get("token").asText();

        assertThat(body.get("nickname").asText()).isEqualTo("펫주인");
        assertThat(tokenProvider.parseMemberId(token)).isEqualTo(memberId);
    }

    @Test
    void 로그인도_같은_memberId를_돌려준다() throws Exception {
        long signedUp = signUp("돌아온사람", "1234").get("memberId").asLong();

        mockMvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("돌아온사람", "1234")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.memberId").value(signedUp));
    }

    /**
     * 다른 사람은 다른 번호다.
     *
     * 같은 번호가 나오면 두 사람의 세이브가 브라우저에서 같은 칸을 쓰게 된다.
     */
    @Test
    void 사람이_다르면_memberId도_다르다() throws Exception {
        long first = signUp("앞사람", "1234").get("memberId").asLong();
        long second = signUp("뒷사람", "1234").get("memberId").asLong();

        assertThat(first).isNotEqualTo(second);
    }

    private JsonNode signUp(String nickname, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/auth/sign-up")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(nickname, password)))
                .andExpect(status().isOk())
                .andReturn();

        return mapper.readTree(result.getResponse().getContentAsString());
    }

    private String credentials(String nickname, String password) {
        return "{\"nickname\": \"%s\", \"password\": \"%s\"}".formatted(nickname, password);
    }
}
