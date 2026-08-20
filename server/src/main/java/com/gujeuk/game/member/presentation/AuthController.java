package com.gujeuk.game.member.presentation;

import com.gujeuk.game.member.presentation.dto.AuthRequest;
import com.gujeuk.game.member.presentation.dto.AuthResponse;
import com.gujeuk.game.member.service.LoginService;
import com.gujeuk.game.member.service.SignUpService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {
    private final SignUpService signUpService;
    private final LoginService loginService;

    @PostMapping("/sign-up")
    public AuthResponse signUp(@RequestBody @Valid AuthRequest request) {
        return signUpService.execute(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody @Valid AuthRequest request) {
        return loginService.execute(request);
    }
}
