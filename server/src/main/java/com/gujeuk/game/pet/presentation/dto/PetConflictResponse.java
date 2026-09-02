package com.gujeuk.game.pet.presentation.dto;

import com.gujeuk.game.pet.domain.PetSnapshot;

/**
 * 충돌 응답(409).
 *
 * 다른 에러는 {@code {"message": ...}} 한 줄이지만 여기에는 서버 상태를 같이
 * 싣는다. 충돌은 사용자에게 "어느 쪽을 쓸까요"를 물어야 하는 상황이고, 그
 * 화면을 그리는 데 필요한 값이 이미 서버에 있어서 한 번 더 받으러 가게 할
 * 이유가 없다.
 */
public record PetConflictResponse(String message, PetResponse server) {

    private static final String MESSAGE = "다른 기기에 더 최근 진행이 있습니다.";

    public static PetConflictResponse of(PetSnapshot server) {
        return new PetConflictResponse(MESSAGE, PetResponse.from(server));
    }
}
