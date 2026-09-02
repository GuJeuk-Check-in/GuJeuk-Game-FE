package com.gujeuk.game.pet.presentation.dto;

/** 올리기 성공. 클라이언트는 이 값을 다음 baseSyncedAt으로 들고 있는다. */
public record PetSyncResponse(long syncedAt) {
}
