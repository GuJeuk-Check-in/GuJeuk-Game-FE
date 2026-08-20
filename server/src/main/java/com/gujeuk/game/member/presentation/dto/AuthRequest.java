package com.gujeuk.game.member.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AuthRequest(
        @NotBlank(message = "닉네임을 입력해주세요.")
        @Size(min = 2, max = 12, message = "닉네임은 2~12자여야 합니다.")
        @Pattern(regexp = "^[가-힣a-zA-Z0-9_]+$", message = "닉네임에는 한글·영문·숫자·_만 쓸 수 있습니다.")
        String nickname,

        @NotBlank(message = "비밀번호를 입력해주세요.")
        @Size(min = 4, max = 64, message = "비밀번호는 4자 이상이어야 합니다.")
        String password
) {
}
