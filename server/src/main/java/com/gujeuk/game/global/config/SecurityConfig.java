package com.gujeuk.game.global.config;

import com.gujeuk.game.global.jwt.JwtFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Configuration
@RequiredArgsConstructor
public class SecurityConfig {
    private final JwtFilter jwtFilter;

    @Value("${game.cors.allowed-origins}")
    private String allowedOrigins;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/health", "/auth/**", "/ws/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/ranking").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(handling -> handling.authenticationEntryPoint(unauthorized()))
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    /**
     * 인증이 없거나 토큰이 깨졌을 때 **401**을 낸다.
     *
     * 기본값은 403(본문 없음)이다. 그런데 프론트의 공용 클라이언트
     * (packages/api 의 client.ts)는 **401일 때만** 토큰을 지우고 로그인 화면으로
     * 되돌린다. 403이 나가면 그 경로가 영영 걸리지 않아, 토큰이 만료된 사람은
     * 로그인하라는 말도 못 듣고 요청이 조용히 실패하는 것만 본다.
     *
     * 펫타운에서 특히 위험하다. 기관에서 한 기기를 여러 사람이 번갈아 쓰므로
     * 앞사람의 만료된 토큰이 남아 있을 수 있는데, 그 상태로 계속 놀면 진행이
     * 서버에 올라가지 않는다.
     *
     * 본문 모양은 GlobalExceptionHandler 와 같은 {@code {"message": ...}} 로 맞춘다 —
     * 클라이언트가 에러 본문을 한 가지 방식으로만 읽으면 되게 하려는 것이다.
     */
    private AuthenticationEntryPoint unauthorized() {
        ObjectMapper mapper = new ObjectMapper();

        return (request, response, exception) -> {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            mapper.writeValue(
                    response.getWriter(),
                    Map.of("message", "로그인이 필요합니다.")
            );
        };
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(origins());
        // PUT·DELETE는 펫 세이브(PUT /pet, DELETE /pet) 때문에 필요하다. 빠져 있으면
        // 브라우저가 사전 요청 단계에서 막는데, 그 실패는 서버 로그에 남지 않아
        // 원인을 찾는 데 오래 걸린다.
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.addAllowedHeader("*");

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);

        return source;
    }

    private List<String> origins() {
        return Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .toList();
    }
}
