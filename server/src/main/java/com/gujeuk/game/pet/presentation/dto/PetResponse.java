package com.gujeuk.game.pet.presentation.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.gujeuk.game.pet.domain.PetSnapshot;

/**
 * 서버에 있는 세이브. 클라이언트가 보낸 모양 그대로 돌려준다.
 *
 * 서버가 따로 가공한 형태를 만들지 않는 이유는, 두 모양이 생기는 순간 어느
 * 쪽이 진짜인지 매번 따져야 하기 때문이다.
 */
public record PetResponse(JsonNode save, long syncedAt) {

    public static PetResponse from(PetSnapshot snapshot) {
        return new PetResponse(snapshot.save(), snapshot.syncedAt());
    }
}
