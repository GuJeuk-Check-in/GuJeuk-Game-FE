package com.gujeuk.game.pet.domain;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 저장할 준비가 끝난 세이브 한 덩어리.
 *
 * {@code save}가 정본이고 나머지는 거기서 뽑아낸 사본이다. 클라이언트가
 * name·level 같은 값을 따로 보내게 하면 JSON 안의 값과 컬럼이 어긋날 수 있어서
 * 서버가 직접 뽑는다({@link PetSaveReader}).
 */
public record PetSaveContent(
        String name,
        int level,
        int exp,
        int coins,
        int saveVersion,
        JsonNode save
) {
}
