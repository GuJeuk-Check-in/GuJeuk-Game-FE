package com.gujeuk.game.pet.domain;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 서버에 있는 그대로의 세이브와 그 시각.
 *
 * {@code save}는 받은 문서 그대로다. 서버는 세이브를 해석하지 않으므로 자바
 * 객체로 풀었다가 다시 담을 이유가 없고, 그러지 않는 편이 알 수 없는 필드나
 * 알 수 없는 version이 오갈 때 원본이 상하지 않는다.
 */
public record PetSnapshot(JsonNode save, long syncedAt) {
}
