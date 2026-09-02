package com.gujeuk.game.pet.service;

import com.gujeuk.game.pet.domain.PetSnapshot;

/**
 * 올리기의 결과.
 *
 * 충돌을 예외로 던지지 않는 것은, 충돌이 잘못된 요청이 아니라 일어나기로
 * 되어 있는 정상 경로이기 때문이다. 응답에 서버 상태를 함께 실어야 해서
 * 예외 핸들러의 {@code {"message": ...}} 한 줄로는 담기지도 않는다.
 */
public sealed interface PetSaveResult {

    /** 올라갔다. 클라이언트는 이 값을 다음 baseSyncedAt으로 들고 있는다. */
    record Saved(long syncedAt) implements PetSaveResult {
    }

    /**
     * 다른 기기가 먼저 올렸다. 어느 쪽을 쓸지는 사람이 고른다.
     *
     * lastSeenAt이 더 큰 쪽을 서버가 자동으로 고르고 싶어지지만, 그 값은
     * 클라이언트가 보낸 것이고 기기 시계는 틀릴 수 있다. 조용한 자동 병합은
     * 진행이 사라지는 사고의 원인이 된다.
     */
    record Conflict(PetSnapshot server) implements PetSaveResult {
    }
}
