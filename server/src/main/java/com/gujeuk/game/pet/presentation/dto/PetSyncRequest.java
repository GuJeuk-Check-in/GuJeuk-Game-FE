package com.gujeuk.game.pet.presentation.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 올리기 요청.
 *
 * 세이브는 통째로 받는다. 부분 갱신(PATCH)을 두지 않는 것은, 필드 단위로
 * 합치는 것이 곧 자동 병합이기 때문이다.
 *
 * {@code baseSyncedAt}은 이 클라이언트가 알고 있는 마지막 서버 시각(epoch
 * 밀리초)이고, 처음 올릴 때는 null이다. 회원은 여기서 받지 않는다 —
 * 주인은 토큰이 정한다.
 *
 * 다른 요청 DTO(AuthRequest)와 달리 bean validation 애너테이션이 없다. 검사할
 * 것이 {@code save} 안쪽의 모양인데 그것은 {@link com.fasterxml.jackson.databind.JsonNode}라
 * 애너테이션으로 표현되지 않고, 검사를 두 곳에 나누면 같은 400에 서로 다른
 * message가 붙는다. 형식 검사는 전부
 * {@link com.gujeuk.game.pet.domain.PetSaveReader}가 하고, {@code save}가 아예
 * 없는 경우도 거기서 같은 문구로 막는다(명세 §8).
 */
public record PetSyncRequest(JsonNode save, Long baseSyncedAt) {
}
